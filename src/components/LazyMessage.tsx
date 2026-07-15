import { useEffect, useRef, useState } from 'react'
import type { DerivedMessage } from '../model/derive'
import { useAppStore } from '../model/store'
import { MessageItem } from './MessageItem'

/** 共享 IntersectionObserver：进入扩展视口（上下各两屏）才真正渲染 react-markdown */
let sharedObserver: IntersectionObserver | null = null
const pending = new Map<Element, () => void>()

function observe(el: Element, onVisible: () => void) {
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const cb = pending.get(entry.target)
        if (cb) {
          pending.delete(entry.target)
          sharedObserver!.unobserve(entry.target)
          cb()
        }
      }
    },
    { rootMargin: '200% 0px' },
  )
  pending.set(el, onVisible)
  sharedObserver.observe(el)
  return () => {
    pending.delete(el)
    sharedObserver?.unobserve(el)
  }
}

/** 占位高度估算：只影响挂载前滚动条准确性 */
function estimateHeight(msg: DerivedMessage): number {
  let h = Math.min(4000, Math.max(64, msg.contentChars * 0.55))
  if (msg.attachments.length) h += 190
  if (msg.thinking) h += 44
  return Math.round(h)
}

/**
 * 懒挂载消息：占位 div → 进入扩展视口后挂载（此后不卸载），
 * 挂载后由 content-visibility 继续跳过屏外的重排重绘。
 */
export function LazyMessage({ msg }: { msg: DerivedMessage }) {
  const forced = useAppStore((s) => s.forcedIds.has(msg.id))
  const flashing = useAppStore((s) => s.flashId === msg.id)
  const clearFlash = useAppStore((s) => s.clearFlash)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const mounted = visible || forced

  useEffect(() => {
    if (mounted || !ref.current) return
    return observe(ref.current, () => setVisible(true))
  }, [mounted])

  useEffect(() => {
    if (!flashing) return
    const t = setTimeout(clearFlash, 1800)
    return () => clearTimeout(t)
  }, [flashing, clearFlash])

  if (!mounted) {
    return <div ref={ref} id={msg.id} className="scroll-mt-14" style={{ height: estimateHeight(msg) }} />
  }
  return (
    <div
      className={flashing ? 'flash-highlight rounded-xl' : undefined}
      style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${estimateHeight(msg)}px` }}
    >
      <MessageItem msg={msg} />
    </div>
  )
}
