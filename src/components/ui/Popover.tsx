import { cloneElement, useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react'

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & RefAttributes<HTMLButtonElement>

/** 浮层进入浏览器 top layer，避免被长记录的 content-visibility 和滚动容器裁切。 */
export function Popover({
  trigger,
  children,
  className = '',
  align = 'start',
  ariaLabel,
  onOpenChange,
}: {
  trigger: ReactElement<TriggerProps>
  children: ReactNode | ((actions: { close: () => void }) => ReactNode)
  className?: string
  align?: 'start' | 'end'
  ariaLabel?: string
  onOpenChange?: (open: boolean) => void
}) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    const element = panel.current!
    if (!open) {
      if (element.matches(':popover-open')) element.hidePopover()
      return
    }
    element.showPopover()
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect()
      const edge = 8
      const gap = 7
      const width = document.documentElement.clientWidth
      const height = window.innerHeight
      element.style.maxWidth = `${width - edge * 2}px`
      const below = height - rect.bottom - gap - edge
      const above = rect.top - gap - edge
      const upward = element.scrollHeight > below && above > below
      element.style.maxHeight = `${Math.max(80, upward ? above : below)}px`
      const bounds = element.getBoundingClientRect()
      const x = align === 'end' ? rect.right - bounds.width : rect.left
      element.style.left = `${Math.max(edge, Math.min(x, width - bounds.width - edge))}px`
      element.style.top = `${Math.max(edge, upward ? rect.top - gap - bounds.height : rect.bottom + gap)}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    window.addEventListener('resize', place)
    // 滚动正文时菜单与触发按钮保持相邻；菜单自身滚动不重新测量。
    const onScroll = (event: Event) => {
      if (!element.contains(event.target as Node)) place()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, align])

  return (
    <>
      {cloneElement(trigger, {
        ref: anchor,
        type: 'button',
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': 'dialog',
        onClick: (event) => {
          trigger.props.onClick?.(event)
          if (!event.defaultPrevented) setOpen(!open)
        },
      })}
      <div
        id={id}
        ref={panel}
        popover="auto"
        role="dialog"
        aria-label={ariaLabel}
        className={`dg-popover hc-scrollbar ${className}`}
        onToggle={(event) => {
          const next = event.newState === 'open'
          setOpen(next)
          onOpenChange?.(next)
        }}
      >
        {typeof children === 'function' ? children({ close }) : children}
      </div>
    </>
  )
}
