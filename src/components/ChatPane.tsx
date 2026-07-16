import { useEffect, useLayoutEffect, useRef } from 'react'
import { setLazyMessageObservationPaused } from '../lib/lazyRendering'
import { useAppStore } from '../model/store'
import { DateDivider } from './DateDivider'
import { LazyMessage } from './LazyMessage'

/** 非节首消息的落点在顶部留白（露出上文与吸顶日期药丸） */
const SCROLL_TOP_OFFSET = 56
const ACTIVE_SESSION_OFFSET = 64
const TARGET_EPSILON = 0.75
const TARGET_SNAP_DISTANCE = 2
const TARGET_STABLE_FRAMES = 3
const LANDING_SETTLE_MS = 120
const SCROLL_INTERRUPT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * 计算跳转落点 scrollTop。目标是节首消息时以整个 section 为锚——
 * 日期药丸恰好置顶，也不会在上方留白里露出前一节吸顶药丸被裁剩的残影。
 */
function jumpTop(scroller: HTMLElement, el: HTMLElement): number {
  let anchor: Element = el
  let offset = SCROLL_TOP_OFFSET
  const section = el.closest('section')
  if (section) {
    // el 可能包在 LazyMessage 的外层 div 里，先爬到 section 的直接子节点
    let child: Element = el
    while (child.parentElement && child.parentElement !== section) child = child.parentElement
    // section 的第一个子元素是 DateDivider，紧随其后的就是节首消息
    if (child.previousElementSibling === section.firstElementChild) {
      anchor = section
      offset = 0
    }
  }
  const top =
    anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset
  return Math.max(0, Math.min(Math.round(top), scroller.scrollHeight - scroller.clientHeight))
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select, [contenteditable="true"]'))
  )
}

/** 导航期间任何真实滚动意图都立即接管；API 触发的 scroll 事件不在此列。 */
function listenForScrollIntent(scroller: HTMLElement, onInterrupt: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isEditableEventTarget(event.target)
    ) {
      return
    }
    if (SCROLL_INTERRUPT_KEYS.has(event.key)) onInterrupt()
  }
  scroller.addEventListener('wheel', onInterrupt, { passive: true })
  scroller.addEventListener('touchstart', onInterrupt, { passive: true })
  scroller.addEventListener('pointerdown', onInterrupt, { passive: true })
  window.addEventListener('keydown', onKeyDown)
  return () => {
    scroller.removeEventListener('wheel', onInterrupt)
    scroller.removeEventListener('touchstart', onInterrupt)
    scroller.removeEventListener('pointerdown', onInterrupt)
    window.removeEventListener('keydown', onKeyDown)
  }
}

export function ChatPane() {
  const doc = useAppStore((s) => s.doc)
  const filter = useAppStore((s) => s.filter)
  const jumpTarget = useAppStore((s) => s.jumpTarget)
  const jumpSmooth = useAppStore((s) => s.jumpSmooth)
  const clearJump = useAppStore((s) => s.clearJump)
  const requestJump = useAppStore((s) => s.requestJump)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const rootRef = useRef<HTMLDivElement>(null)

  // 平滑跳转沿途不触发 Markdown 批量挂载；目标由 forcedIds 单独保证真实布局。
  useLayoutEffect(() => {
    setLazyMessageObservationPaused(jumpTarget !== null)
    return () => setLazyMessageObservationPaused(false)
  }, [jumpTarget])

  // 滚动时更新「当前日期节」（72 个 section 线性扫描，rAF 节流，足够便宜）
  useEffect(() => {
    const scroller = rootRef.current?.closest('main')
    // 目录动画期间完全冻结；结束后依赖变化会重新挂监听并立即计算最终日期。
    if (!scroller || jumpTarget) return
    let raf = 0
    const update = () => {
      raf = 0
      const sections = rootRef.current?.querySelectorAll<HTMLElement>('[data-session]')
      if (!sections?.length) return
      const activationTop = scroller.getBoundingClientRect().top + ACTIVE_SESSION_OFFSET
      let active = Number(sections[0]!.dataset['session'])
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= activationTop) active = Number(el.dataset['session'])
        else break
      }
      setActiveSession(active)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [setActiveSession, doc, filter, jumpTarget])

  // 初始定位：日记打开在「最近一天」
  useEffect(() => {
    if (!doc) return
    const lastSession = doc.sessions[doc.sessions.length - 1]
    const first = lastSession?.messages[0]
    if (first) requestJump(first.id)
  }, [doc, requestJump])

  // 跳转：目标已被 forcedIds 强制挂载；滚动一律手动写 scrollTop——
  // 原生 scrollIntoView({behavior:'smooth'}) 的终点在启动时就定死，
  // 途中懒挂载消息以真实高度替换估算高度会让它落空，事后校正又表现为「突然停住/跳一下」。
  useEffect(() => {
    if (!jumpTarget) return
    const scroller = rootRef.current?.closest('main')
    if (!scroller) {
      clearJump()
      return
    }
    // 旧 controller 的落点预热可能已恢复 observer；新导航必须重新取得暂停状态。
    // 真正的最终释放由上面的 jumpTarget layout effect 统一负责，避免 A→B 时旧 cleanup 覆盖新导航。
    setLazyMessageObservationPaused(true)
    let raf = 0
    let finished = false
    let landingObservationResumedAt: number | null = null
    let stopListeningForIntent = () => {}

    const resumeLandingObservation = (now: number) => {
      if (landingObservationResumedAt !== null) return
      landingObservationResumedAt = now
      setLazyMessageObservationPaused(false)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      stopListeningForIntent()
    }
    const finish = () => {
      if (finished) return
      finished = true
      stop()
      clearJump()
    }
    stopListeningForIntent = listenForScrollIntent(scroller, finish)

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (jumpSmooth && !prefersReducedMotion) {
      // 自绘平滑滚动：每帧向「目标元素此刻的位置」指数逼近，
      // 布局漂移只会平滑地并入轨迹，落点永远精确。
      const startedAt = performance.now()
      let last = startedAt
      let stableFrames = 0
      const step = (now: number) => {
        if (finished) return
        const element = document.getElementById(jumpTarget)
        if (!element) return finish()
        const destination = jumpTop(scroller, element)
        const distance = destination - scroller.scrollTop
        const elapsed = Math.min(64, now - last)
        last = now

        // 接近目标后预热最终两屏；controller 仍是唯一 writer，会吸收这批真实布局。
        if (Math.abs(distance) <= scroller.clientHeight * 2) resumeLandingObservation(now)

        // Chromium 的 scrollTop 可能量化到 2/3px；距离很小时直接吸附，避免指数步长被吞掉。
        if (Math.abs(distance) <= TARGET_SNAP_DISTANCE) {
          scroller.scrollTop = destination
          stableFrames += 1
        } else {
          stableFrames = 0
          scroller.scrollTop += distance * (1 - Math.exp(-elapsed / 90))
        }

        const landingSettled =
          landingObservationResumedAt !== null && now - landingObservationResumedAt >= LANDING_SETTLE_MS
        if ((stableFrames >= TARGET_STABLE_FRAMES && landingSettled) || now - startedAt > 2000) {
          scroller.scrollTop = jumpTop(scroller, element)
          return finish()
        }
        raf = requestAnimationFrame(step)
      }
      // 等强制挂载的目标完成首次布局再起步。
      raf = requestAnimationFrame((now) => {
        last = now
        raf = requestAnimationFrame(step)
      })
      return () => {
        finished = true
        stop()
      }
    }

    // 瞬时跳转（初始定位、搜索、减少动态效果）：落点窗口完成布局后才交还原生锚定。
    let stableFrames = 0
    let previousDestination: number | null = null
    const startedAt = performance.now()
    const apply = (now: number) => {
      if (finished) return
      const element = document.getElementById(jumpTarget)
      if (!element) return finish()
      const destination = jumpTop(scroller, element)
      scroller.scrollTop = destination
      resumeLandingObservation(now)
      if (previousDestination !== null && Math.abs(destination - previousDestination) < TARGET_EPSILON) {
        stableFrames += 1
      } else {
        stableFrames = 0
      }
      previousDestination = destination
      const landingSettled = now - (landingObservationResumedAt ?? now) >= LANDING_SETTLE_MS
      if ((stableFrames >= TARGET_STABLE_FRAMES && landingSettled) || now - startedAt > 1200) {
        return finish()
      }
      raf = requestAnimationFrame(apply)
    }
    raf = requestAnimationFrame(apply)
    return () => {
      finished = true
      stop()
    }
  }, [jumpTarget, jumpSmooth, clearJump])

  if (!doc) return null

  return (
    <div ref={rootRef} className="mx-auto max-w-[var(--dg-content-width)] px-3 pb-24 sm:px-6">
      {doc.sessions.map((session) => {
        const msgs = filter === 'all' ? session.messages : session.messages.filter((m) => m.role === filter)
        if (msgs.length === 0) return null
        return (
          <section key={session.index} id={`s${session.index}`} data-session={session.index}>
            <DateDivider session={session} count={msgs.length} />
            {msgs.map((m) => (
              <LazyMessage key={m.id} msg={m} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
