import { useMemo, useState } from 'react'
import { ArrowRight, ReplaceAll, Search } from 'lucide-react'
import type { DerivedMessage } from '../model/derive'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from './EditorDialog'
import { applyReplacementMatches, findReplacementMatches } from './findReplace'
import type { MessageReplacement, ReplacementScope } from './findReplace'

const scopes: { id: ReplacementScope; label: string }[] = [
  { id: 'body', label: '正文' },
  { id: 'reasoning', label: '思考' },
  { id: 'commentary', label: '过程说明' },
  { id: 'annotations', label: '批注' },
  { id: 'tags', label: '标签' },
  { id: 'model', label: '模型' },
]

export function FindReplaceDialog({
  messages,
  onApply,
  onClose,
}: {
  messages: DerivedMessage[]
  onApply: (patches: MessageReplacement[]) => void | Promise<void>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [selectedScopes, setSelectedScopes] = useState<ReplacementScope[]>(['body'])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = useMemo(
    () => findReplacementMatches(messages, query, { scopes: selectedScopes, caseSensitive }),
    [messages, query, selectedScopes, caseSensitive],
  )
  const selected = matches.filter((match) => !excluded.has(match.id))
  const countMessages = new Set(selected.map((match) => match.messageId)).size
  const resetSelection = () => {
    setExcluded(new Set())
    setVisibleCount(100)
    setError('')
  }
  return (
    <EditorDialog
      wide
      title="查找与替换"
      subtitle={`在当前范围的 ${messages.length.toLocaleString()} 条记录中查找。逐项预览后，再保存替换。`}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs text-neutral-500">将修改 {countMessages} 条记录</span>
          <button type="button" className={mutedButtonClass} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!selected.length || busy || query === replacement}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await onApply(applyReplacementMatches(messages, selected, replacement))
                onClose()
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '替换失败，请重试。')
              } finally {
                setBusy(false)
              }
            }}
          >
            <ReplaceAll size={16} />
            {busy ? '正在替换…' : `替换选中的 ${selected.length} 处`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="查找">
            <input
              autoFocus
              data-editor-autofocus
              className={fieldClass}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                resetSelection()
              }}
              placeholder="需要查找的文字"
            />
          </Field>
          <Field label="替换为">
            <input
              className={fieldClass}
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="留空会删除匹配文字"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {scopes.map((scope) => (
            <label
              key={scope.id}
              className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
            >
              <input
                className="accent-[var(--dg-accent)]"
                type="checkbox"
                checked={selectedScopes.includes(scope.id)}
                onChange={(event) => {
                  setSelectedScopes(
                    event.target.checked
                      ? [...selectedScopes, scope.id]
                      : selectedScopes.filter((value) => value !== scope.id),
                  )
                  resetSelection()
                }}
              />
              {scope.label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              className="accent-[var(--dg-accent)]"
              checked={caseSensitive}
              onChange={(event) => {
                setCaseSensitive(event.target.checked)
                resetSelection()
              }}
            />
            区分大小写
          </label>
        </div>
        {!query ? (
          <div className="py-14 text-center text-neutral-400">
            <Search size={24} className="mx-auto mb-3" />
            <p className="text-sm">输入文字，预览每一处修改。</p>
          </div>
        ) : matches.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            这个范围中没有找到「{query}」。
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--dg-accent)]"
                  checked={selected.length === matches.length}
                  onChange={(event) =>
                    setExcluded(
                      event.target.checked ? new Set() : new Set(matches.map((match) => match.id)),
                    )
                  }
                />
                选择全部 {matches.length} 处
              </label>
              <span className="text-xs text-neutral-500">已选 {selected.length} 处</span>
            </div>
            <div className="max-h-[43dvh] space-y-2 overflow-y-auto">
              {matches.slice(0, visibleCount).map((match) => (
                <label
                  key={match.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl bg-neutral-50 p-4 hover:bg-neutral-100 dark:bg-neutral-800/40 dark:hover:bg-neutral-800/70"
                >
                  <input
                    type="checkbox"
                    checked={!excluded.has(match.id)}
                    className="mt-1 accent-[var(--dg-accent)]"
                    onChange={(event) => {
                      const next = new Set(excluded)
                      if (event.target.checked) next.delete(match.id)
                      else next.add(match.id)
                      setExcluded(next)
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mb-2 block text-xs text-neutral-400">
                      {match.date ?? '未标日期'} ·{' '}
                      {scopes.find((scope) => scope.id === match.scope)?.label}
                    </span>
                    <span className="block whitespace-pre-wrap break-words text-sm leading-6">
                      {match.start > 45 ? '…' : ''}
                      {match.text.slice(Math.max(0, match.start - 45), match.start)}
                      <mark className="rounded bg-amber-200/70 px-0.5 text-neutral-900 dark:bg-amber-700/50 dark:text-amber-100">
                        {match.text.slice(match.start, match.end)}
                      </mark>
                      {match.text.slice(match.end, match.end + 70)}
                      {match.end + 70 < match.text.length ? '…' : ''}
                    </span>
                    <span className="mt-2 flex items-start gap-2 text-sm text-[var(--dg-accent)] dark:text-[var(--dg-accent)]">
                      <ArrowRight size={14} className="mt-1 shrink-0" />
                      <span className="whitespace-pre-wrap break-words">
                        {replacement || '删除这段文字'}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {matches.length > visibleCount && (
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => setVisibleCount(visibleCount + 100)}
              >
                再显示 100 处
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </EditorDialog>
  )
}
