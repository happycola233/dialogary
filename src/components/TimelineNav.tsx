import { CalendarDays, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { formatMonthCn } from '../lib/format'
import { matchesFilters } from '../model/filters'
import { useAppStore } from '../model/store'

const COLLAPSE_DELAY = 180
const MAX_RAIL_MARKS = 48

/** 日期轴只使用文档中的节顺序；时间不连续的追加记录也拥有独立落点。 */
export function TimelineNav() {
  const doc = useAppStore((state) => state.doc)
  const view = useAppStore((state) => state.view)
  const filter = useAppStore((state) => state.filter)
  const filters = useAppStore((state) => state.filters)
  const readMode = useAppStore((state) => state.readMode)
  const activeSession = useAppStore((state) => state.activeSession)
  const requestJump = useAppStore((state) => state.requestJump)
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoringFocus = useRef(false)

  const items = useMemo(
    () =>
      (doc?.sessions ?? []).flatMap((session) => {
        const messages = session.messages.filter(
          (message) =>
            (filter === 'all' || message.role === filter) &&
            (readMode !== 'diary' || message.role === 'user') &&
            matchesFilters(message, filters),
        )
        const first = messages[0]
        return first ? [{ session, first, count: messages.length }] : []
      }),
    [doc, filter, filters, readMode],
  )

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.session.index === activeSession),
  )
  const activeItem = items[activeIndex]
  // 长日记按等距桶绘制刻度，避免几百个日期挤成一条实线；展开列表仍完整保留。
  const markCount = Math.min(items.length, MAX_RAIL_MARKS)
  const activeMark =
    items.length > 1 ? Math.round((activeIndex * (markCount - 1)) / (items.length - 1)) : 0

  const cancelCollapse = () => {
    if (collapseTimer.current !== null) clearTimeout(collapseTimer.current)
    collapseTimer.current = null
  }
  const openPanel = () => {
    cancelCollapse()
    if (!restoringFocus.current) setExpanded(true)
  }
  const closePanel = (restoreFocus = false) => {
    cancelCollapse()
    setExpanded(false)
    if (restoreFocus) {
      // 恢复键盘焦点时不要由 focus 事件立即把面板重新打开。
      restoringFocus.current = true
      triggerRef.current?.focus({ preventScroll: true })
      restoringFocus.current = false
    }
  }
  const scheduleCollapse = () => {
    cancelCollapse()
    collapseTimer.current = setTimeout(() => {
      if (!rootRef.current?.querySelector(':focus-visible')) setExpanded(false)
      collapseTimer.current = null
    }, COLLAPSE_DELAY)
  }

  useEffect(
    () => () => {
      if (collapseTimer.current !== null) clearTimeout(collapseTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!expanded) return
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePanel()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [expanded])

  useLayoutEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-current="location"]')
    if (!expanded || !list || !active) return
    // 仅滚动浮层自身，避免 scrollIntoView 把正文带离当前阅读位置。
    const bounds = list.getBoundingClientRect()
    const row = active.getBoundingClientRect()
    if (row.top < bounds.top + 12 || row.bottom > bounds.bottom - 12)
      list.scrollTop += row.top - bounds.top - list.clientHeight / 2 + row.height / 2
  }, [expanded, activeSession])

  if (view !== 'chat' || items.length < 2) return null

  const jump = (index: number, keyboard = false) => {
    const item = items[index]
    if (!item) return
    requestJump(item.first.id, { smooth: true })
    closePanel(keyboard)
  }

  return (
    <div
      ref={rootRef}
      className={clsx('dg-timeline', expanded && 'is-expanded')}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') openPanel()
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') scheduleCollapse()
      }}
      onFocusCapture={openPanel}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleCollapse()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closePanel(true)
        }
      }}
    >
      <button
        ref={triggerRef}
        className="dg-timeline-trigger"
        aria-label="打开日期导航"
        aria-expanded={expanded}
        aria-controls="date-timeline-panel"
        onClick={openPanel}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openPanel()
            const focusCurrent = () => {
              const current = listRef.current?.querySelector<HTMLButtonElement>(
                '[aria-current="location"]',
              )
              current?.focus({ preventScroll: true })
            }
            if (listRef.current) focusCurrent()
            else requestAnimationFrame(focusCurrent)
          }
        }}
      >
        <span className="dg-timeline-mobile">
          <CalendarDays size={17} />
          <span>{activeItem?.session.date?.slice(5).replace('-', '/') ?? '日期'}</span>
        </span>
        <span
          className="dg-timeline-marks"
          aria-hidden="true"
          style={{ gap: Math.max(3, Math.min(8, 256 / Math.max(1, markCount) - 2)) }}
        >
          {Array.from({ length: markCount }, (_, index) => (
            <span
              key={index}
              className={clsx(
                'dg-timeline-mark',
                index === activeMark && 'is-active',
                index % 5 === 0 && 'is-major',
              )}
            />
          ))}
        </span>
        <span className="dg-timeline-current" aria-hidden="true">
          {activeItem?.session.date?.slice(0, 7).replace('-', '.')}
        </span>
      </button>
      {expanded && (
        <section id="date-timeline-panel" className="dg-timeline-panel" aria-label="日期导航">
          <header className="dg-timeline-heading">
            <div>
              <h2>日期导航</h2>
              <p>
                {activeIndex + 1} / {items.length} 个日期
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                className="dg-icon"
                aria-label="前往开头"
                title="前往开头"
                onClick={(event) => jump(0, event.detail === 0)}
              >
                <ChevronUp size={16} />
              </button>
              <button
                className="dg-icon"
                aria-label="前往末尾"
                title="前往末尾"
                onClick={(event) => jump(items.length - 1, event.detail === 0)}
              >
                <ChevronDown size={16} />
              </button>
              <button
                className="dg-icon"
                aria-label="关闭日期导航"
                onClick={() => closePanel(true)}
              >
                <X size={16} />
              </button>
            </div>
          </header>
          <div
            ref={listRef}
            className="dg-timeline-list hc-scrollbar"
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-timeline-session]'),
              )
              const index = buttons.indexOf(event.target as HTMLButtonElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : Math.max(
                        0,
                        Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                      )
              buttons[next]?.focus()
            }}
          >
            {items.map((item, index) => {
              const { session } = item
              const month = session.date?.slice(0, 7) ?? '未标日期'
              const startsMonth =
                index === 0 ||
                items[index - 1]!.session.date?.slice(0, 7) !== session.date?.slice(0, 7)
              const title =
                session.title && !/^(周|星期)[一二三四五六日天]$/.test(session.title)
                  ? session.title
                  : session.weekday
              return (
                <div key={session.index}>
                  {startsMonth && <h3 className="dg-timeline-month">{formatMonthCn(month)}</h3>}
                  <button
                    className="dg-timeline-row"
                    data-timeline-session={session.index}
                    aria-current={activeSession === session.index ? 'location' : undefined}
                    onClick={(event) => jump(index, event.detail === 0)}
                    title={`${session.date ?? '未标日期'}${title ? ` · ${title}` : ''} · ${item.count} 条记录`}
                  >
                    <span className="dg-timeline-day">{session.date?.slice(8) ?? '—'}</span>
                    <span className="dg-timeline-row-label">
                      <span>{title || '记录'}</span>
                      <small>{session.date?.slice(0, 7).replace('-', ' / ') ?? '未标日期'}</small>
                    </span>
                    <span className="dg-timeline-count">{item.count}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
