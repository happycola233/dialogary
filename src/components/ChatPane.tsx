import { useEffect, useRef } from 'react'
import { useAppStore } from '../model/store'
import { DateDivider } from './DateDivider'
import { LazyMessage } from './LazyMessage'

export function ChatPane() {
  const doc = useAppStore((s) => s.doc)
  const filter = useAppStore((s) => s.filter)
  const jumpTarget = useAppStore((s) => s.jumpTarget)
  const clearJump = useAppStore((s) => s.clearJump)
  const requestJump = useAppStore((s) => s.requestJump)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const rootRef = useRef<HTMLDivElement>(null)

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

  // 跳转：目标已被 forcedIds 强制挂载；懒挂载会让上方高度漂移，做多次校正
  useEffect(() => {
    if (!jumpTarget) return
    const scroll = () => document.getElementById(jumpTarget)?.scrollIntoView({ block: 'start' })
    const raf = requestAnimationFrame(() => {
      scroll()
      requestAnimationFrame(scroll)
    })
    const t1 = setTimeout(scroll, 250)
    const t2 = setTimeout(() => {
      scroll()
      clearJump()
    }, 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [jumpTarget, clearJump])

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
