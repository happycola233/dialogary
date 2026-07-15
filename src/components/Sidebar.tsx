import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { formatMonthCn } from '../lib/format'
import type { DerivedSession } from '../model/derive'
import { useAppStore } from '../model/store'

/** 大纲：月份分组 → 日期节行；点击跳转，滚动时高亮当前节 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const doc = useAppStore((s) => s.doc)
  const filter = useAppStore((s) => s.filter)
  const activeSession = useAppStore((s) => s.activeSession)
  const jumping = useAppStore((s) => s.jumpTarget !== null)
  const requestJump = useAppStore((s) => s.requestJump)
  const listRef = useRef<HTMLDivElement>(null)

  // 当前节变化时让高亮行保持可见。手动只滚侧栏自己的容器——
  // scrollIntoView 会波及所有可滚动祖先，也不认识吸顶月份头的遮挡。
  // 跳转动画期间冻结：activeSession 会连续扫过途经的日期，跟着滚只会让
  // 侧栏乱跳；等跳转结束（jumping 变回 false）再一次性校正到最终位置。
  useEffect(() => {
    if (jumping) return
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(`[data-nav-session="${activeSession}"]`)
    if (!list || !row) return
    const listRect = list.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const stickyH = 34 // 吸顶月份头高度：行从上方进入时不被它盖住
    const pad = 8 // 从下方进入时不贴死底边
    if (rowRect.top < listRect.top + stickyH) list.scrollTop += rowRect.top - listRect.top - stickyH
    else if (rowRect.bottom > listRect.bottom - pad)
      list.scrollTop += rowRect.bottom - listRect.bottom + pad
  }, [activeSession, jumping])

  if (!doc) return null

  const countOf = (s: DerivedSession) =>
    filter === 'all' ? s.messages.length : filter === 'user' ? s.userCount : s.aiCount

  const jumpTo = (s: DerivedSession) => {
    const first = filter === 'all' ? s.messages[0] : s.messages.find((m) => m.role === filter)
    if (first) {
      requestJump(first.id, { smooth: true })
      onNavigate?.()
    }
  }

  return (
    <div ref={listRef} className="hc-scrollbar h-full overflow-y-auto overscroll-contain px-2 pb-3">
      {doc.months.map((month) => {
        const sessions = month.sessions.filter((s) => countOf(s) > 0)
        if (sessions.length === 0) return null
        return (
          <div key={month.ym} className="mb-2">
            {/* 吸顶月份头：不透明且横向铺满（-mx-2 抵消容器 gutter），否则滚过的行会从缝隙露出 */}
            <div className="sticky top-0 z-10 -mx-2 bg-neutral-50 px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-neutral-400 dark:bg-neutral-900 dark:text-neutral-500">
              {month.ym === '未标日期' ? month.ym : formatMonthCn(month.ym)}
            </div>
            {sessions.map((s) => (
              <button
                key={s.index}
                type="button"
                data-nav-session={s.index}
                title={[s.date, s.weekday, s.title].filter(Boolean).join(' · ')}
                onClick={() => jumpTo(s)}
                className={clsx(
                  'flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                  s.index === activeSession
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
                )}
              >
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {s.date ? s.date.slice(5) : '——'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {s.title ?? s.weekday ?? ''}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {countOf(s)}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
