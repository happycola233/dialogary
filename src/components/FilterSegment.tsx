import clsx from 'clsx'
import { useAppStore, type RoleFilter } from '../model/store'

const OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'user', label: '只看我' },
  { value: 'ai', label: '只看 AI' },
]

export function FilterSegment() {
  const filter = useAppStore((s) => s.filter)
  const setFilter = useAppStore((s) => s.setFilter)
  return (
    <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setFilter(o.value)}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
            filter === o.value
              ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-600/70 dark:text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
