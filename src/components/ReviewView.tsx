import { ArrowUpRight, CalendarDays, Shuffle, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { todayString, useAppStore } from '../model/store'
import { Markdown } from '../markdown/Markdown'
import { formatDateCn } from '../lib/format'
import { fieldClass } from '../editor/EditorDialog'
import { Select } from './ui/Select'

export function ReviewView() {
  const state = useAppStore()
  const [mode, setMode] = useState<'today' | 'random'>('today')
  const [tag, setTag] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pick, setPick] = useState(0)
  const today = todayString()
  const pool = useMemo(
    () =>
      state.doc!.messages.filter(
        (message) =>
          message.role === 'user' &&
          message.content &&
          (!tag || message.tags?.includes(tag)) &&
          (!from || (message.effectiveDate && message.effectiveDate >= from)) &&
          (!to || (message.effectiveDate && message.effectiveDate <= to)),
      ),
    [state.doc, tag, from, to],
  )
  const matching = pool.filter(
    (message) =>
      message.effectiveDate?.slice(5) === today.slice(5) &&
      message.effectiveDate < today.slice(0, 4) + '-01-01',
  )
  const messages = mode === 'today' ? matching : pool.length ? [pool[pick % pool.length]!] : []
  const tags = [...new Set(state.doc!.messages.flatMap((message) => message.tags ?? []))]
  const shuffle = () => {
    setMode('random')
    setPick(
      pool.length > 1
        ? (pick + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length
        : 0,
    )
  }
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <div className="mb-9">
        <p className="text-[10px] tracking-[0.2em] text-[var(--dg-accent)] dark:text-[var(--dg-accent)]">
          那些被认真记下的日子
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">时光回顾</h2>
        <p className="mt-3 text-sm leading-7 text-neutral-400">
          重读过去，也许会遇见不一样的自己。
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          className={`dg-tab ${mode === 'today' ? 'is-active' : ''}`}
          onClick={() => setMode('today')}
        >
          <CalendarDays size={15} />
          往年今日
        </button>
        <button className={`dg-tab ${mode === 'random' ? 'is-active' : ''}`} onClick={shuffle}>
          <Shuffle size={15} />
          随手翻一页
        </button>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          aria-label="回顾标签"
          className="w-full"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          options={[
            { value: '', label: '所有话题' },
            ...tags.map((item) => ({ value: item, label: item })),
          ]}
        />
        <input
          type="date"
          aria-label="回顾起始日期"
          className={`${fieldClass} !text-xs`}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          type="date"
          aria-label="回顾结束日期"
          className={`${fieldClass} !text-xs`}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      {!messages.length ? (
        <div className="py-14 text-center">
          <Sparkles className="mx-auto mb-5 text-[var(--dg-accent)]" size={34} strokeWidth={1.3} />
          <p className="text-sm text-neutral-500">
            {mode === 'today' ? '往年的今天，还没有留下记录' : '这个范围里还没有记录'}
          </p>
          <button className="dg-save mx-auto mt-6" disabled={!pool.length} onClick={shuffle}>
            翻翻其他日子
            <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {messages.map((message) => (
            <article key={message.id} className="dg-memory">
              <div className="mb-5 flex items-center justify-between">
                <time className="text-xs text-[var(--dg-accent)] dark:text-[var(--dg-accent)]">
                  {message.effectiveDate ? formatDateCn(message.effectiveDate) : '未标日期'}
                </time>
                <button
                  className="dg-icon"
                  aria-label="回到这条记录"
                  onClick={() => state.requestJump(message.id, { flash: true })}
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <Markdown text={message.content} />
              <div className="mt-6 flex flex-wrap gap-2">
                {message.tags?.map((item) => (
                  <span key={item} className="dg-chip">
                    #{item}
                  </span>
                ))}
                {message.mood && <span className="dg-chip">{message.mood}</span>}
              </div>
            </article>
          ))}
          {mode === 'random' && (
            <button className="dg-save mx-auto" onClick={shuffle}>
              <Shuffle size={15} />
              再翻一页
            </button>
          )}
        </div>
      )}
    </div>
  )
}
