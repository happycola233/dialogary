import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  hasNativeScrollAnchoring,
  observeLazyMessageVisibility,
  observeLegacyMessageSize,
} from '../lib/lazyRendering'
import { estimateMessagePlaceholderHeight } from '../lib/messageHeight'
import type { DerivedMessage } from '../model/derive'
import { useAppStore } from '../model/store'
import { MessageItem } from './MessageItem'

interface PendingMountGeometry {
  root: HTMLElement
  height: number
  wasAboveViewport: boolean
}

/**
 * 懒挂载消息：稳定 shell 始终保留同一个 id/DOM 身份。
 * 首次挂载先用 content-visibility:visible 强制得到真实高度；量到后才切回 auto，
 * 从而让 contain-intrinsic-block-size 使用可靠的 remembered size，而不是坏估值。
 */
export const LazyMessage = memo(function LazyMessage({ msg }: { msg: DerivedMessage }) {
  const forced = useAppStore((state) => state.forcedIds.has(msg.id))
  const flashing = useAppStore((state) => state.flashId === msg.id)
  const clearFlash = useAppStore((state) => state.clearFlash)
  // React key 已固定消息身份；文档重新派生后，收藏等小修改不能让已读消息退回占位符。
  const [revealed, setRevealed] = useState(false)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const pendingMountGeometryRef = useRef<PendingMountGeometry | null>(null)
  const mounted = revealed || forced
  const estimatedHeight = useMemo(() => estimateMessagePlaceholderHeight(msg), [msg])

  useEffect(() => {
    if (mounted || !shellRef.current) return
    const shell = shellRef.current
    const scrollRoot = shell.closest('main')
    if (!(scrollRoot instanceof HTMLElement) || typeof IntersectionObserver === 'undefined') {
      setRevealed(true)
      return
    }
    return observeLazyMessageVisibility(scrollRoot, shell, () => {
      const shellRect = shell.getBoundingClientRect()
      pendingMountGeometryRef.current = {
        root: scrollRoot,
        height: shellRect.height,
        wasAboveViewport: shellRect.bottom <= scrollRoot.getBoundingClientRect().top + 0.5,
      }
      setRevealed(true)
    })
  }, [mounted])

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!mounted || !shell) return

    // 此时 shell 仍是 content-visibility:visible；同步读布局可确保首个 remembered size 真实可靠。
    const height = shell.getBoundingClientRect().height
    const pendingGeometry = pendingMountGeometryRef.current
    pendingMountGeometryRef.current = null
    if (
      !hasNativeScrollAnchoring &&
      pendingGeometry?.wasAboveViewport &&
      pendingGeometry.root.contains(shell) &&
      useAppStore.getState().jumpTarget === null
    ) {
      pendingGeometry.root.scrollTop += height - pendingGeometry.height
    }
    setMeasuredHeight(height)
    // 导航强制挂载的消息也永久保留，forcedIds 清理时不再次卸载 Markdown。
    setRevealed(true)

    const scrollRoot = shell.closest('main')
    if (
      hasNativeScrollAnchoring ||
      !(scrollRoot instanceof HTMLElement) ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }
    return observeLegacyMessageSize(shell, scrollRoot, height)
  }, [mounted])

  useEffect(() => {
    if (!flashing) return
    const timeout = setTimeout(clearFlash, 1800)
    return () => clearTimeout(timeout)
  }, [flashing, clearFlash])

  let style: CSSProperties
  if (!mounted) {
    style = { height: estimatedHeight, overflowAnchor: 'none' }
  } else if (!hasNativeScrollAnchoring) {
    // 旧 Safari 对 skipped content 不可靠地派发 ResizeObserver；保持 visible 才能稳定补偿异步变化。
    style = { contentVisibility: 'visible', overflowAnchor: 'auto' }
  } else if (measuredHeight === null) {
    style = { contentVisibility: 'visible', overflowAnchor: 'auto' }
  } else {
    style = {
      contentVisibility: 'auto',
      containIntrinsicBlockSize: `auto ${measuredHeight}px`,
      overflowAnchor: 'auto',
    }
  }

  return (
    <div
      ref={shellRef}
      id={msg.id}
      data-message-mounted={mounted ? 'true' : 'false'}
      aria-hidden={mounted ? undefined : true}
      className={`scroll-mt-14 ${flashing ? 'flash-highlight rounded-xl' : ''}`}
      style={style}
    >
      {mounted && <MessageItem msg={msg} />}
    </div>
  )
})
