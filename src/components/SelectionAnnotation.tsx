import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../model/store'
import { selectionToolbarPosition, visibleSelectionAnchor } from './selectionGeometry'

interface ExcerptSelection {
  messageId: string
  quote: string
  range: Range
  body: HTMLElement
}

const nonContent =
  'button, input, textarea, select, summary, [role="button"], [contenteditable="true"], [aria-hidden="true"], [inert], .dg-attachment-gallery'

const parentElement = (node: Node | null) =>
  node instanceof Element ? node : (node?.parentElement ?? null)

function readExcerptSelection(): ExcerptSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null
  const quote = selection.toString()
  if (!quote.trim()) return null
  const range = selection.getRangeAt(0)
  const start = parentElement(range.startContainer)
  const end = parentElement(range.endContainer)
  const body = start?.closest<HTMLElement>('[data-message-body]')
  if (!body || end?.closest('[data-message-body]') !== body) return null
  if (start?.closest(nonContent) || end?.closest(nonContent)) return null
  // 跨过工具按钮或折叠内容的选区并非纯正文，不能把控件文案一起存成摘录。
  if ([...body.querySelectorAll(nonContent)].some((element) => range.intersectsNode(element)))
    return null
  const messageId = body.closest<HTMLElement>('[data-message-id]')?.dataset.messageId
  return messageId ? { messageId, quote, range: range.cloneRange(), body } : null
}

/** 阅读区只挂载一份监听；浮层进入 top layer，长消息和懒加载容器不会裁切摘录菜单。 */
export function SelectionAnnotation() {
  const [excerpt, setExcerpt] = useState<ExcerptSelection | null>(null)
  const excerptRef = useRef<ExcerptSelection | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const editor = useAppStore((state) => state.editor)
  const sourceKey = useAppStore((state) => state.sourceKey)

  useEffect(() => {
    excerptRef.current = null
    setExcerpt(null)
  }, [editor, sourceKey])

  useEffect(() => {
    let frame = 0
    let dragging = false
    const dismiss = () => {
      excerptRef.current = null
      setExcerpt(null)
    }
    const refresh = () => {
      frame = 0
      if (dragging || panel.current?.contains(document.activeElement)) return
      const next = document.querySelector('dialog:modal') ? null : readExcerptSelection()
      excerptRef.current = next
      setExcerpt(next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(refresh)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return
      dragging = true
      dismiss()
    }
    const onPointerUp = () => {
      dragging = false
      schedule()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!excerptRef.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      } else if (
        event.key === 'Tab' &&
        !event.shiftKey &&
        !panel.current?.contains(document.activeElement)
      ) {
        // 保留系统文字选择，用一次 Tab 进入摘录操作，不劫持方向键或系统复制快捷键。
        event.preventDefault()
        action.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useLayoutEffect(() => {
    const element = panel.current!
    if (!excerpt) {
      if (element.matches(':popover-open')) element.hidePopover()
      return
    }
    const dismiss = () => {
      excerptRef.current = null
      setExcerpt(null)
    }
    const place = () => {
      if (!excerpt.body.isConnected) return dismiss()
      const scroller = excerpt.body.closest('main')?.getBoundingClientRect()
      const visual = window.visualViewport
      const viewport = {
        top: Math.max(visual?.offsetTop ?? 0, scroller?.top ?? 0),
        bottom: Math.min(
          (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight),
          scroller?.bottom ?? window.innerHeight,
        ),
        left: visual?.offsetLeft ?? 0,
        right: (visual?.offsetLeft ?? 0) + (visual?.width ?? document.documentElement.clientWidth),
      }
      const anchor = visibleSelectionAnchor([...excerpt.range.getClientRects()], viewport)
      if (!anchor) return dismiss()
      if (!element.matches(':popover-open')) element.showPopover()
      const bounds = element.getBoundingClientRect()
      const position = selectionToolbarPosition(anchor, viewport, bounds.width, bounds.height)
      element.style.left = `${position.left}px`
      element.style.top = `${position.top}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [excerpt])

  return (
    <div
      ref={panel}
      popover="manual"
      role="toolbar"
      aria-label="摘录操作"
      className="dg-selection-toolbar"
      onPointerDown={(event) => event.preventDefault()}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          excerptRef.current = null
          setExcerpt(null)
        }
      }}
    >
      <button
        ref={action}
        type="button"
        aria-label="为选中文字添加批注"
        onClick={() => {
          const selected = excerptRef.current
          if (!selected) return
          const state = useAppStore.getState()
          const message = state.doc?.messages.find((item) => item.id === selected.messageId)
          if (!message) return
          // 先把原样摘录交给编辑器，再清除选区；焦点切换不会丢失长文本。
          state.setEditor({
            id: message.id,
            date: message.effectiveDate ?? '',
            tab: 'annotations',
            quote: selected.quote,
          })
          excerptRef.current = null
          setExcerpt(null)
          window.getSelection()?.removeAllRanges()
        }}
      >
        <MessageSquarePlus size={15} aria-hidden />
        添加批注
      </button>
    </div>
  )
}
