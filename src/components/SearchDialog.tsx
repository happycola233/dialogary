import { ArrowDown, ArrowUp, Bot, CornerDownLeft, Search, Sparkles, User } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { timeOfDay } from '../lib/format'
import type { DerivedDoc } from '../model/derive'
import { searchMessages } from '../model/search'
import { useAppStore } from '../model/store'
import { EditorDialog, fieldClass } from '../editor/EditorDialog'

export function SearchDialog() {
  const open = useAppStore((state) => state.searchOpen)
  const doc = useAppStore((state) => state.doc)
  const setOpen = useAppStore((state) => state.setSearchOpen)
  return open && doc ? <SearchPanel doc={doc} onClose={() => setOpen(false)} /> : null
}

function SearchPanel({ doc, onClose }: { doc: DerivedDoc; onClose: () => void }) {
  const requestJump = useAppStore((state) => state.requestJump)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const hits = useMemo(
    () => (debounced.trim() ? searchMessages(doc, debounced) : []),
    [doc, debounced],
  )
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query)
      setActive(0)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-result-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const jump = (id: string) => {
    requestJump(id, { flash: true })
    onClose()
  }
  return (
    <EditorDialog
      title="找回一段记录"
      subtitle="搜索正文、思考、批注、标签和模型信息。"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>
            {debounced.trim()
              ? `找到 ${hits.length}${hits.length >= 200 ? '+' : ''} 条记录`
              : '输入你还记得的几个字'}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp size={12} />
            <ArrowDown size={12} />
            选择
            <CornerDownLeft size={12} className="ml-2" />
            打开
          </span>
        </div>
      }
    >
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-neutral-400" />
        <input
          data-editor-autofocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          role="combobox"
          aria-label="搜索记录"
          aria-controls={listId}
          aria-expanded={hits.length > 0}
          aria-autocomplete="list"
          aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
          placeholder="一个片段，也是一条线索…"
          className={`${fieldClass} pl-10`}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' && hits.length) {
              event.preventDefault()
              setActive((value) => (value + 1) % hits.length)
            } else if (event.key === 'ArrowUp' && hits.length) {
              event.preventDefault()
              setActive((value) => (value - 1 + hits.length) % hits.length)
            } else if (event.key === 'Enter' && hits[active]) {
              event.preventDefault()
              jump(hits[active]!.id)
            }
          }}
        />
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="搜索结果"
        className="mt-4 max-h-[54dvh] space-y-1 overflow-y-auto overscroll-contain"
      >
        {!debounced.trim() ? (
          <div className="py-12 text-center text-sm leading-7 text-neutral-400">
            <Search size={25} strokeWidth={1.4} className="mx-auto mb-4 opacity-60" />
            <p>那些说过的话，都留在这里。</p>
            <p className="mt-1 text-xs">搜索结果会带上日期和上下文。</p>
          </div>
        ) : hits.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            没有找到「{debounced.trim()}」，试试更短的词。
          </p>
        ) : (
          hits.map((hit, index) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${index}`}
              aria-selected={index === active}
              data-result-index={index}
              key={hit.id}
              onClick={() => jump(hit.id)}
              onPointerMove={() => setActive(index)}
              className={`flex w-full flex-col gap-2 rounded-xl px-3 py-3 text-left transition ${index === active ? 'bg-[var(--dg-accent-soft)]' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
            >
              <span className="flex items-center gap-2 text-[11px] text-neutral-400">
                {hit.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                <span>{hit.date ?? '未标日期'}</span>
                {hit.time && timeOfDay(hit.time) && <span>{timeOfDay(hit.time)}</span>}
                {hit.inThinking && (
                  <span className="ml-auto flex items-center gap-1">
                    <Sparkles size={11} />
                    记录详情
                  </span>
                )}
              </span>
              <span className="line-clamp-3 text-[13px] leading-6 text-neutral-600 dark:text-neutral-300">
                {hit.before}
                <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
                  {hit.match}
                </mark>
                {hit.after}
              </span>
            </button>
          ))
        )}
      </div>
    </EditorDialog>
  )
}
