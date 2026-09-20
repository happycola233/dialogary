import { MessageSquare, Pencil, Plus, Star } from 'lucide-react'
import { formatDateCn } from '../lib/format'
import { Markdown } from '../markdown/Markdown'
import type { DerivedSession } from '../model/derive'
import { todayString, useAppStore } from '../model/store'
import { Popover } from './ui/Popover'

/** 日期与个人整理信息同属日期节；星期始终由日期计算。 */
export function DateDivider({ session, count }: { session: DerivedSession; count: number }) {
  const setDateEditor = useAppStore((state) => state.setDateEditor)
  const setEditor = useAppStore((state) => state.setEditor)
  const setFilters = useAppStore((state) => state.setFilters)
  const label = session.date ? formatDateCn(session.date) : '未标日期'
  const hasPersonal =
    session.tags?.length ||
    session.mood ||
    session.states?.length ||
    session.reactions?.length ||
    session.annotations?.length
  return (
    <div className="sticky top-0 z-10 py-2.5" style={{ overflowAnchor: 'none' }}>
      <div className="mx-auto w-fit max-w-full rounded-2xl bg-white/95 px-2 py-1 backdrop-blur dark:bg-black/95">
        <div className="flex items-center justify-center gap-1 text-xs">
          <button
            type="button"
            title="编辑这一天"
            aria-label={`编辑日期 ${session.date ?? '未标日期'}`}
            onClick={() => setDateEditor(session.index)}
            className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-[var(--dg-accent)] dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            {session.starred && <Star size={12} className="fill-amber-400 text-amber-500" />}
            <span className="font-medium">{label}</span>
            {session.weekday && <span className="text-neutral-400">{session.weekday}</span>}
            {session.title && session.title !== session.weekday && (
              <span className="max-w-64 truncate text-neutral-500 dark:text-neutral-400">
                {session.title}
              </span>
            )}
            <Pencil size={11} className="text-neutral-400" />
          </button>
          <span className="whitespace-nowrap text-[10px] text-neutral-400">{count} 条</span>
          <button
            type="button"
            className="dg-icon !h-7 !w-7"
            aria-label={`在 ${session.date ?? '这一天'} 添加记录`}
            title="在这一天补写"
            onClick={() =>
              setEditor({
                date: session.date ?? todayString(),
                afterId: session.messages.at(-1)?.id,
              })
            }
          >
            <Plus size={14} />
          </button>
        </div>
        {hasPersonal ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-2 pb-1 pt-0.5">
            {session.reactions?.map((emoji) => (
              <span key={emoji} className="text-sm">
                {emoji}
              </span>
            ))}
            {session.mood && (
              <button
                type="button"
                className="dg-chip"
                onClick={() => setDateEditor(session.index)}
              >
                {session.mood}
              </button>
            )}
            {session.states?.map((state) => (
              <button
                type="button"
                key={state}
                className="dg-chip"
                onClick={() => setDateEditor(session.index)}
              >
                {state}
              </button>
            ))}
            {session.tags?.map((tag) => (
              <button
                type="button"
                key={tag}
                className="dg-chip"
                onClick={() => setFilters({ tag })}
              >
                #{tag}
              </button>
            ))}
            {!!session.annotations?.length && (
              <Popover
                trigger={
                  <button type="button" className="dg-chip">
                    <MessageSquare size={11} />
                    {session.annotations.length} 条当天备注
                  </button>
                }
                ariaLabel={`${label}的备注`}
                align="end"
                className="dg-menu w-[min(21rem,calc(100vw-3rem))] space-y-4 p-4 text-xs text-neutral-500 dark:text-neutral-400"
              >
                {({ close }) => (
                  <>
                    {session.annotations!.map((note) => (
                      <div key={note.id}>
                        {note.quote && (
                          <blockquote className="mb-2 text-xs text-neutral-400">
                            “{note.quote}”
                          </blockquote>
                        )}
                        <Markdown text={note.text} />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs text-[var(--dg-accent)]"
                      onClick={() => {
                        close()
                        setDateEditor(session.index)
                      }}
                    >
                      编辑当天备注
                    </button>
                  </>
                )}
              </Popover>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
