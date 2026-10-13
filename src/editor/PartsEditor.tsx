import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Globe,
  MessageSquareText,
  Plus,
  Shapes,
  Trash2,
} from 'lucide-react'
import type { MessagePart } from '../parser/types'
import { Markdown } from '../markdown/Markdown'
import { BrainIcon } from '../components/BrainIcon'
import { Select } from '../components/ui/Select'
import { reasoningSeconds } from '../process/reasoningTiming'
import { searchActionOf } from '../process/searchActivity'
import { Field, fieldClass, mutedButtonClass } from './EditorDialog'
import { TokenInput } from './TokenInput'
import { insertionIndex, PROCESS_KINDS } from './types'

const KIND_LABELS: Record<string, string> = {
  reasoning: '思考',
  commentary: '过程说明',
  search: '检索',
  answer: '正文',
}
const ADDABLE: { kind: string; label: string; icon: ReactNode; process: boolean }[] = [
  { kind: 'reasoning', label: '思考', icon: <BrainIcon className="h-4 w-4" />, process: true },
  { kind: 'commentary', label: '过程说明', icon: <MessageSquareText size={16} />, process: true },
  { kind: 'search', label: '检索', icon: <Globe size={16} />, process: true },
  { kind: 'answer', label: '正文', icon: <AlignLeft size={16} />, process: false },
  { kind: 'custom', label: '其他内容', icon: <Shapes size={16} />, process: true },
]
const SEARCH_TYPES = [
  { value: 'search', label: '搜索' },
  { value: 'open_page', label: '打开网页' },
  { value: 'find_in_page', label: '页内查找' },
]

/** 检索动作按规范保存在 data.action 中；旧写法的字段由 searchActionOf 读出后一并迁入。 */
function withSearchAction(part: MessagePart, patch: Record<string, unknown>): MessagePart {
  const raw = part.data?.action
  const current =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    ...part,
    data: {
      ...part.data,
      action: { ...searchActionOf(part.kind, part.data), ...current, ...patch },
    },
  }
}

export function PartsEditor({
  parts,
  processKinds,
  onChange,
}: {
  parts: MessagePart[]
  /** AI 回复才有思考、过程说明与检索；「我」的记录只调整正文与附件的顺序。 */
  processKinds: boolean
  onChange: (parts: MessagePart[]) => void
}) {
  const [preview, setPreview] = useState<number | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const update = (index: number, patch: Partial<MessagePart>) =>
    onChange(parts.map((part, i) => (i === index ? { ...part, ...patch } : part)))
  const move = (index: number, offset: number) => {
    const next = [...parts]
    ;[next[index], next[index + offset]] = [next[index + offset]!, next[index]!]
    onChange(next)
  }
  const add = (kind: string) => {
    const id = `part_${crypto.randomUUID()}`
    const next = [...parts]
    next.splice(insertionIndex(parts, kind), 0, { id, kind, text: '' })
    onChange(next)
    setPreview(null)
    setFocusId(id)
  }
  // 新块可能插在列表中间，滚动到它并直接开始输入。
  useEffect(() => {
    if (!focusId) return
    const section = listRef.current?.querySelector<HTMLElement>(`[data-part-id="${focusId}"]`)
    section?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    section?.querySelector<HTMLElement>('textarea')?.focus({ preventScroll: true })
    setFocusId(null)
  }, [focusId, parts])
  const kindOptions = (kind: string) => {
    const available = processKinds ? [...PROCESS_KINDS, 'answer'] : ['answer']
    return [...new Set([kind, ...available])].map((value) => ({
      value,
      label: KIND_LABELS[value] ?? value,
    }))
  }
  return (
    <div ref={listRef} className="space-y-5">
      <p className="text-sm leading-6 text-neutral-500">
        {processKinds
          ? '按回复发生的顺序整理思考、说明、检索和正文。上下移动可以调整它们的阅读顺序。'
          : '上下移动可以调整正文与附件的阅读顺序。'}
      </p>
      {parts.map((part, index) => {
        const options = kindOptions(part.kind)
        const action = part.kind === 'search' ? searchActionOf(part.kind, part.data) : null
        const recordedSeconds =
          typeof part.data?.duration_ms === 'number' ? part.data.duration_ms / 1000 : null
        // 旧记录的时长写在标签里（如「已思考 12s」），阅读时同样会显示。
        const labelSeconds = recordedSeconds === null ? reasoningSeconds(part) : null
        return (
          <section
            key={part.id ?? index}
            data-part-id={part.id ?? index}
            className="space-y-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-800/40"
          >
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-neutral-400">{index + 1}</span>
              {part.kind === 'attachment' || options.length === 1 ? (
                <span className="mr-auto px-2 text-sm font-medium">
                  {part.kind === 'attachment' ? '附件' : options[0]!.label}
                </span>
              ) : (
                <Select
                  aria-label={`内容块 ${index + 1} 类型`}
                  value={part.kind}
                  onChange={(event) => update(index, { kind: event.target.value })}
                  className="mr-auto"
                  size="sm"
                  options={options}
                />
              )}
              <button
                type="button"
                disabled={index === 0}
                aria-label={`上移内容块 ${index + 1}`}
                className={mutedButtonClass}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                disabled={index === parts.length - 1}
                aria-label={`下移内容块 ${index + 1}`}
                className={mutedButtonClass}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={15} />
              </button>
              {part.kind !== 'attachment' && (
                <button
                  type="button"
                  aria-label={`删除内容块 ${index + 1}`}
                  className={mutedButtonClass}
                  onClick={() => onChange(parts.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            {part.kind === 'attachment' ? (
              <p className="text-xs leading-6 text-neutral-500">
                可以上下移动调整阅读顺序。文件名称和路径请在「附件」中编辑。
              </p>
            ) : (
              <>
                {part.kind === 'reasoning' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="思考时长（秒）">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={recordedSeconds ?? ''}
                        onChange={(event) => {
                          const data = { ...part.data }
                          if (event.target.value === '') delete data.duration_ms
                          else data.duration_ms = Number(event.target.value) * 1000
                          update(index, { data })
                        }}
                        placeholder={labelSeconds === null ? '未记录' : String(labelSeconds)}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                )}
                {action && (
                  <div className="dg-details-grid grid gap-3 sm:grid-cols-2">
                    <Field label="检索动作">
                      <Select
                        value={action.type}
                        className="w-full"
                        onChange={(event) =>
                          onChange(
                            parts.map((value, i) =>
                              i === index
                                ? withSearchAction(value, { type: event.target.value })
                                : value,
                            ),
                          )
                        }
                        options={
                          SEARCH_TYPES.some((type) => type.value === action.type)
                            ? SEARCH_TYPES
                            : [{ value: action.type, label: action.type }, ...SEARCH_TYPES]
                        }
                      />
                    </Field>
                    {action.type === 'search' ? (
                      <TokenInput
                        label="查询词"
                        values={action.queries ?? []}
                        onChange={(queries) =>
                          onChange(
                            parts.map((value, i) =>
                              i === index ? withSearchAction(value, { queries }) : value,
                            ),
                          )
                        }
                      />
                    ) : (
                      <Field label="网址">
                        <input
                          type="url"
                          value={action.url ?? ''}
                          onChange={(event) =>
                            onChange(
                              parts.map((value, i) =>
                                i === index
                                  ? withSearchAction(value, {
                                      url: event.target.value || undefined,
                                    })
                                  : value,
                              ),
                            )
                          }
                          placeholder="https://"
                          className={fieldClass}
                        />
                      </Field>
                    )}
                    {action.type === 'find_in_page' && (
                      <Field label="查找内容">
                        <input
                          value={action.pattern ?? ''}
                          onChange={(event) =>
                            onChange(
                              parts.map((value, i) =>
                                i === index
                                  ? withSearchAction(value, {
                                      pattern: event.target.value || undefined,
                                    })
                                  : value,
                              ),
                            )
                          }
                          className={fieldClass}
                        />
                      </Field>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">内容</span>
                  <button
                    type="button"
                    className="text-xs text-[var(--dg-accent)] dark:text-[var(--dg-accent)]"
                    onClick={() => setPreview(preview === index ? null : index)}
                  >
                    {preview === index ? '继续编辑' : '预览'}
                  </button>
                </div>
                {preview === index ? (
                  <div className="min-h-28 px-1 py-2">
                    <Markdown
                      text={part.text ?? ''}
                      variant={part.kind === 'reasoning' ? 'reasoning' : 'message'}
                    />
                  </div>
                ) : (
                  <textarea
                    aria-label={`内容块 ${index + 1} 正文`}
                    rows={5}
                    value={part.text ?? ''}
                    onChange={(event) => update(index, { text: event.target.value })}
                    className={`${fieldClass} resize-y leading-7`}
                    placeholder={
                      part.kind === 'reasoning'
                        ? '**小节标题**\n\n这一步想了什么…'
                        : '支持 Markdown…'
                    }
                  />
                )}
                <PartDataEditor part={part} onChange={(data) => update(index, { data })} />
              </>
            )}
          </section>
        )
      })}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="添加内容块">
        <span className="mr-1 flex items-center gap-1 text-xs text-neutral-400">
          <Plus size={14} />
          添加
        </span>
        {ADDABLE.filter((item) => processKinds || !item.process).map((item) => (
          <button
            type="button"
            key={item.kind}
            aria-label={`添加${item.label}`}
            className={`${mutedButtonClass} !gap-1.5 !px-2.5`}
            onClick={() => add(item.kind)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PartDataEditor({
  part,
  onChange,
}: {
  part: MessagePart
  onChange: (data: Record<string, unknown>) => void
}) {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState('')
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer py-1">更多数据</summary>
      <textarea
        aria-label="内容块扩展数据"
        rows={5}
        className={`${fieldClass} mt-2 font-mono text-xs`}
        value={source ?? JSON.stringify(part.data ?? {}, null, 2)}
        onChange={(event) => {
          setSource(event.target.value)
          try {
            const value: unknown = JSON.parse(event.target.value)
            if (!value || typeof value !== 'object' || Array.isArray(value))
              throw new Error('请输入 JSON 对象。')
            event.target.setCustomValidity('')
            setError('')
            onChange(value as Record<string, unknown>)
          } catch {
            const message = '请检查 JSON 格式，补全括号、引号和逗号。'
            event.target.setCustomValidity(message)
            setError(message)
          }
        }}
        onBlur={() => {
          if (!error) setSource(null)
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </details>
  )
}
