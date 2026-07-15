import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { restoreAnchor } from '../lib/scrollAnchoring'
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

/**
 * 共享 ResizeObserver：任何消息尺寸变化（估算高度 → 真实高度、图片/公式加载…）
 * 后做一次滚动锚定回写，防止视口内容被顶开。机制详见 lib/scrollAnchoring.ts。
 */
let sizeObserver: ResizeObserver | null = null

function observeSize(el: Element) {
  sizeObserver ??= new ResizeObserver(() => restoreAnchor())
  sizeObserver.observe(el)
  return () => sizeObserver?.unobserve(el)
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
  const mountedRef = useRef<HTMLDivElement>(null)
  const mounted = visible || forced

  useEffect(() => {
    if (mounted || !ref.current) return
    return observe(ref.current, () => setVisible(true))
  }, [mounted])

  // 占位符 → 真实内容的替换在本次 commit 内改变布局；绘制前先做一次锚定回写
  // （useLayoutEffect 在 paint 之前，首个 getBoundingClientRect 会强制同步布局，
  // 因此同一批挂载只需任意一个回写即可全部纠正）。后续异步渲染由 RO 兜底。
  useLayoutEffect(() => {
    if (mounted) restoreAnchor()
  }, [mounted])

  // 挂载后监听尺寸变化，持续锚定
  useEffect(() => {
    if (!mounted || !mountedRef.current) return
    return observeSize(mountedRef.current)
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
      ref={mountedRef}
      className={flashing ? 'flash-highlight rounded-xl' : undefined}
      style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${estimateHeight(msg)}px` }}
    >
      <MessageItem msg={msg} />
    </div>
  )
}
