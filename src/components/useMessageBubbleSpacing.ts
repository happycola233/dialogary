import { useLayoutEffect, useRef } from 'react'

/** 按排版后的实际高度区分单行与多行；长句自动折行、字号和阅读宽度变化也会重新测量。 */
export function useMessageBubbleSpacing(enabled: boolean) {
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!enabled || !content) return
    const bubble = content.parentElement!
    const update = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight)
      bubble.dataset.multiline = String(content.getBoundingClientRect().height > lineHeight + 1)
    }
    update()
    // 仅观察正文内层；修改外壳上下留白不会改变被观察的高度，避免 ResizeObserver 循环。
    const observer = new ResizeObserver(update)
    observer.observe(content)
    return () => {
      observer.disconnect()
      delete bubble.dataset.multiline
    }
  }, [enabled])

  return contentRef
}
