import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

interface TooltipTarget {
  element: HTMLElement
  label: string
}

function findTooltipTarget(target: EventTarget | null): TooltipTarget | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>('[data-tooltip], button[aria-label]')
  if (!element || element.dataset.tooltip === 'false') return null
  const label =
    element.dataset.tooltip ||
    element.getAttribute('title') ||
    (!element.innerText?.trim() ? element.getAttribute('aria-label') : null)
  return label ? { element, label } : null
}

/** 共用顶层提示，让懒渲染消息、菜单和模态框里的图标都有一致的鼠标与键盘说明。 */
export function Tooltips() {
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<TooltipTarget | null>(null)

  useEffect(() => {
    let timer = 0
    let activeElement: HTMLElement | null = null
    const hide = () => {
      window.clearTimeout(timer)
      activeElement = null
      setTarget(null)
    }
    const schedule = (next: TooltipTarget | null, immediate = false) => {
      if (next?.element === activeElement) return
      hide()
      if (!next) return
      activeElement = next.element
      timer = window.setTimeout(() => setTarget(next), immediate ? 0 : 380)
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') schedule(findTooltipTarget(event.target))
    }
    const out = (event: PointerEvent) => {
      if (event.relatedTarget instanceof Node && activeElement?.contains(event.relatedTarget))
        return
      hide()
    }
    const focus = (event: FocusEvent) => schedule(findTooltipTarget(event.target), true)
    const move = (event: PointerEvent) => {
      if (event.buttons) hide()
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('click', hide)
    document.addEventListener('pointermove', move)
    document.addEventListener('keydown', hide)
    document.addEventListener('dragstart', hide)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    window.addEventListener('resize', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('click', hide)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('dragstart', hide)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('resize', hide)
    }
  }, [])

  useLayoutEffect(() => {
    const panel = panelRef.current!
    if (!target) return
    panel.showPopover()
    const anchor = target.element.getBoundingClientRect()
    const bounds = panel.getBoundingClientRect()
    const edge = 10
    panel.style.left = `${Math.max(edge, Math.min(anchor.left + (anchor.width - bounds.width) / 2, window.innerWidth - bounds.width - edge))}px`
    panel.style.top = `${anchor.top >= bounds.height + 16 ? anchor.top - bounds.height - 8 : anchor.bottom + 8}px`
    const previousDescription = target.element.getAttribute('aria-describedby')
    const nativeTitle = target.element.getAttribute('title')
    if (nativeTitle) target.element.removeAttribute('title')
    target.element.setAttribute(
      'aria-describedby',
      [previousDescription, id].filter(Boolean).join(' '),
    )
    return () => {
      panel.hidePopover()
      if (previousDescription) target.element.setAttribute('aria-describedby', previousDescription)
      else target.element.removeAttribute('aria-describedby')
      if (nativeTitle) target.element.setAttribute('title', nativeTitle)
    }
  }, [target, id])

  return (
    <div ref={panelRef} id={id} role="tooltip" popover="manual" className="dg-tooltip">
      {target?.label}
    </div>
  )
}
