import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { MessagePart } from '../parser/types'
import { Markdown } from '../markdown/Markdown'
import { Field, fieldClass, mutedButtonClass } from './EditorDialog'
import { Select } from '../components/ui/Select'

const kinds = [
  { value: 'reasoning', label: '思考' },
  { value: 'commentary', label: '过程说明' },
  { value: 'search', label: '检索' },
  { value: 'answer', label: '回答正文' },
]

export function PartsEditor({
  parts,
  onChange,
}: {
  parts: MessagePart[]
  onChange: (parts: MessagePart[]) => void
}) {
  const [kind, setKind] = useState('reasoning')
  const [preview, setPreview] = useState<number | null>(null)
  const update = (index: number, patch: Partial<MessagePart>) =>
    onChange(parts.map((part, i) => (i === index ? { ...part, ...patch } : part)))
  const move = (index: number, offset: number) => {
    const next = [...parts]
    ;[next[index], next[index + offset]] = [next[index + offset]!, next[index]!]
    onChange(next)
  }
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-neutral-500">
        按回复发生的顺序整理思考、说明、检索和回答。上下移动可以调整它们的阅读顺序。
      </p>
      {parts.map((part, index) => (
        <section
          key={part.id ?? index}
          className="space-y-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-800/40"
        >
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-neutral-400">{index + 1}</span>
            {part.kind === 'attachment' ? (
              <span className="mr-auto px-2 text-sm font-medium">附件</span>
            ) : (
              <Select
                aria-label={`内容块 ${index + 1} 类型`}
                value={part.kind}
                onChange={(event) => update(index, { kind: event.target.value })}
                className="mr-auto"
                size="sm"
                options={
                  kinds.some((item) => item.value === part.kind)
                    ? kinds
                    : [{ value: part.kind, label: part.kind }, ...kinds]
                }
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
                      value={
                        typeof part.data?.duration_ms === 'number'
                          ? part.data.duration_ms / 1000
                          : ''
                      }
                      onChange={(event) => {
                        const data = { ...part.data }
                        if (event.target.value === '') delete data.duration_ms
                        else data.duration_ms = Number(event.target.value) * 1000
                        update(index, { data })
                      }}
                      placeholder="未记录"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="思考标题">
                    <input
                      value={String(part.data?.label ?? '')}
                      onChange={(event) =>
                        update(index, { data: { ...part.data, label: event.target.value } })
                      }
                      placeholder="可选，例如 深入思考"
                      className={fieldClass}
                    />
                  </Field>
                </div>
              )}
              {part.kind === 'search' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="检索动作">
                    <Select
                      value={String(part.data?.action ?? 'search')}
                      className="w-full"
                      onChange={(event) =>
                        update(index, { data: { ...part.data, action: event.target.value } })
                      }
                      options={[
                        { value: 'search', label: '搜索' },
                        { value: 'open', label: '打开网页' },
                        { value: 'find', label: '页内查找' },
                      ]}
                    />
                  </Field>
                  <Field label="查询词 / 链接">
                    <input
                      value={String(part.data?.query ?? part.data?.url ?? '')}
                      onChange={(event) =>
                        update(index, {
                          data: {
                            ...part.data,
                            [part.data?.action === 'open' ? 'url' : 'query']: event.target.value,
                          },
                        })
                      }
                      className={fieldClass}
                    />
                  </Field>
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
                  placeholder="支持 Markdown…"
                />
              )}
              <PartDataEditor part={part} onChange={(data) => update(index, { data })} />
            </>
          )}
        </section>
      ))}
      <div className="flex items-center gap-2">
        <Select
          aria-label="新内容块类型"
          className="max-w-40"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          options={[...kinds, { value: 'custom', label: '其他内容' }]}
        />
        <button
          type="button"
          className={mutedButtonClass}
          onClick={() =>
            onChange([...parts, { id: `part_${crypto.randomUUID()}`, kind, text: '' }])
          }
        >
          <Plus size={16} />
          添加
        </button>
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
