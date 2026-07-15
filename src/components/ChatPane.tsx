import { useEffect, useRef } from 'react'
import { initScrollAnchoring } from '../lib/scrollAnchoring'
import { useAppStore } from '../model/store'
import { DateDivider } from './DateDivider'
import { LazyMessage } from './LazyMessage'

/** 非节首消息的落点在顶部留白（露出上文与吸顶日期药丸） */
const SCROLL_TOP_OFFSET = 56

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

export function ChatPane() {
  const doc = useAppStore((s) => s.doc)
  const filter = useAppStore((s) => s.filter)
  const jumpTarget = useAppStore((s) => s.jumpTarget)
  const jumpSmooth = useAppStore((s) => s.jumpSmooth)
  const clearJump = useAppStore((s) => s.clearJump)
  const requestJump = useAppStore((s) => s.requestJump)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const rootRef = useRef<HTMLDivElement>(null)

  // 滚动锚定：视口顶缘内容在懒挂载/异步渲染引起的布局变化后保持原位
  useEffect(() => {
    const scroller = rootRef.current?.closest('main')
    if (scroller) return initScrollAnchoring(scroller)
  }, [doc])

  // 滚动时更新「当前日期节」（72 个 section 线性扫描，rAF 节流，足够便宜）
  useEffect(() => {
    const scroller = rootRef.current?.closest('main')
    if (!scroller) return
    let raf = 0
    const update = () => {
      raf = 0
      const sections = rootRef.current?.querySelectorAll<HTMLElement>('[data-session]')
      if (!sections?.length) return
      let active = Number(sections[0]!.dataset['session'])
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= 88) active = Number(el.dataset['session'])
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
  }, [setActiveSession, doc, filter])

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
    if (!scroller) return

    if (jumpSmooth) {
      // 自绘平滑滚动：每帧向「目标元素此刻的位置」指数逼近，
      // 布局漂移只会平滑地并入轨迹，落点永远精确。
      let raf = 0
      const t0 = performance.now()
      let last = t0
      const stop = () => {
        cancelAnimationFrame(raf)
        scroller.removeEventListener('wheel', abort)
        scroller.removeEventListener('touchstart', abort)
      }
      // 用户滚轮/触摸接管时立即让位
      const abort = () => {
        stop()
        clearJump()
      }
      const step = (now: number) => {
        const el = document.getElementById(jumpTarget)
        if (!el) return abort()
        const dest = jumpTop(scroller, el)
        const dist = dest - scroller.scrollTop
        const dt = Math.min(64, now - last)
        last = now
        if (Math.abs(dist) < 1 || now - t0 > 1600) {
          scroller.scrollTop = dest
          return abort()
        }
        scroller.scrollTop += dist * (1 - Math.exp(-dt / 90))
        raf = requestAnimationFrame(step)
      }
      scroller.addEventListener('wheel', abort, { passive: true })
      scroller.addEventListener('touchstart', abort, { passive: true })
      // 等强制挂载的目标完成首次布局再起步
      raf = requestAnimationFrame((now) => {
        last = now
        raf = requestAnimationFrame(step)
      })
      return stop
    }

    // 瞬时跳转（初始定位/搜索）：落点后短时间内多次校正，吸收懒挂载的高度漂移
    const apply = () => {
      const el = document.getElementById(jumpTarget)
      if (el) scroller.scrollTop = jumpTop(scroller, el)
    }
    const raf = requestAnimationFrame(() => {
      apply()
      requestAnimationFrame(apply)
    })
    const t1 = setTimeout(apply, 250)
    const t2 = setTimeout(() => {
      apply()
      clearJump()
    }, 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
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
