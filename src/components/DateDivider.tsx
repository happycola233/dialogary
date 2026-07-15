import { formatDateCn } from '../lib/format'
import type { DerivedSession } from '../model/derive'

/** 日期节分割线：吸顶小药丸。标题若与星期几重复则不双写。 */
export function DateDivider({ session, count }: { session: DerivedSession; count: number }) {
  const parts: string[] = []
  if (session.date) parts.push(formatDateCn(session.date))
  if (session.weekday && session.title !== session.weekday) parts.push(session.weekday)
  if (session.title) parts.push(session.title)
  if (parts.length === 0) parts.push('未标日期')

  return (
    <div className="sticky top-0 z-10 flex justify-center py-2.5">
      <div className="flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/85 px-3.5 py-1 text-xs text-neutral-500 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-black/85 dark:text-neutral-400">
        <span className="font-medium">{parts.join(' · ')}</span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <span className="text-neutral-400 dark:text-neutral-500">{count}条</span>
      </div>
    </div>
  )
}
