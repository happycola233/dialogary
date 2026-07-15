import { Bot, Search, Sparkles, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { timeOfDay } from '../lib/format'
import { searchMessages } from '../model/search'
import { useAppStore } from '../model/store'

export function SearchDialog() {
  const open = useAppStore((s) => s.searchOpen)
  const setOpen = useAppStore((s) => s.setSearchOpen)
  const doc = useAppStore((s) => s.doc)
  const requestJump = useAppStore((s) => s.requestJump)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setDebounced('')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const hits = useMemo(() => (doc && debounced ? searchMessages(doc, debounced) : []), [doc, debounced])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-3 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-200/80 px-3.5 dark:border-neutral-700/80">
          <Search size={16} className="shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && hits[0]) {
                requestJump(hits[0].id, { flash: true })
                setOpen(false)
              }
            }}
            placeholder="搜索正文与思考摘要…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          {debounced && <span className="shrink-0 text-xs text-neutral-400">{hits.length}{hits.length >= 200 ? '+' : ''} 条</span>}
          <button type="button" onClick={() => setOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
            <X size={15} />
          </button>
        </div>
        <div className="hc-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {debounced && hits.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">没有找到「{debounced}」</p>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                requestJump(h.id, { flash: true })
                setOpen(false)
              }}
              className="flex w-full flex-col gap-1 border-b border-neutral-100 px-4 py-2.5 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
            >
              <span className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                {h.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                <span>{h.date ?? ''}</span>
                {h.time && timeOfDay(h.time) && <span>{timeOfDay(h.time)}</span>}
                {h.inThinking && (
                  <span className="flex items-center gap-0.5 text-neutral-400">
                    <Sparkles size={11} />
                    思考
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-[13px] text-neutral-600 dark:text-neutral-300">
                {h.before}
                <mark className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/40">{h.match}</mark>
                {h.after}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
