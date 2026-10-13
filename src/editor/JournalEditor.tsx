import { useEffect, useId, useRef, useState } from 'react'
import { Select } from '../components/ui/Select'
import { Check, Eye, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { DerivedMessage } from '../model/derive'
import type { Attachment, Message, MessagePart } from '../parser/types'
import { MarkdownEditor } from './MarkdownEditor'
import { AnnotationsEditor } from './AnnotationsEditor'
import { AttachmentsEditor } from './AttachmentsEditor'
import { DetailsEditor } from './DetailsEditor'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from './EditorDialog'
import { PartsEditor } from './PartsEditor'
import {
  clockOf,
  createMessageDraft,
  draftParts,
  timePrecisionOf,
  withClock,
  withParts,
} from './types'
import type { MessageDraft } from './types'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { JsonPreview } from '../components/JsonPreview'
import { formatDateCn } from '../lib/format'

const tabs = [
  { id: 'body', label: '正文' },
  { id: 'details', label: '详情' },
  { id: 'parts', label: '过程' },
  { id: 'annotations', label: '批注' },
  { id: 'attachments', label: '附件' },
  { id: 'source', label: 'JSON' },
] as const
type Tab = (typeof tabs)[number]['id']

/** 行号与时间精度由文件位置和时间推导，不作为可编辑数据；读取时沿用原值。 */
function editableSource(draft: MessageDraft): string {
  const { original: _original, _source, line: _line, timePrecision: _precision, ...value } = draft
  return JSON.stringify(value, null, 2)
}

function readSource(source: string, original: MessageDraft): MessageDraft {
  const value: unknown = JSON.parse(source)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('请输入一条完整的 JSON 消息。')
  const data = value as MessageDraft
  if (
    !['user', 'ai', 'system'].includes(data.role) ||
    typeof data.content !== 'string' ||
    !Array.isArray(data.attachments) ||
    typeof data.date !== 'string'
  )
    throw new Error('请保留角色、日期、正文和附件字段。')
  if (
    data.parts &&
    (!Array.isArray(data.parts) ||
      data.parts.some(
        (part) =>
          !part ||
          typeof part.kind !== 'string' ||
          (part.text !== undefined && typeof part.text !== 'string'),
      ))
  )
    throw new Error('内容块需要包含类型，正文需要是文本。')
  if (
    data.annotations &&
    (!Array.isArray(data.annotations) ||
      data.annotations.some(
        (note) => !note || typeof note.id !== 'string' || typeof note.text !== 'string',
      ))
  )
    throw new Error('每条批注需要包含 ID 和文本。')
  for (const key of ['tags', 'reactions', 'states'] as const)
    if (
      data[key] &&
      (!Array.isArray(data[key]) || data[key].some((item) => typeof item !== 'string'))
    )
      throw new Error('标签、表情和状态需要使用文本数组。')
  if (
    data.attachments.some(
      (attachment) =>
        !attachment ||
        !['image', 'file'].includes(attachment.kind) ||
        typeof attachment.name !== 'string' ||
        (attachment.path !== null && typeof attachment.path !== 'string'),
    )
  )
    throw new Error('附件需要包含名称、类型和文件路径。')
  return { ...original, ...data, original: original.original, _source: original._source }
}

interface StoredEditorDraft {
  draft: MessageDraft
  source: string
  rawSource?: string
  tab?: Tab
}

export interface JournalEditorProps {
  message: DerivedMessage | null
  /** 记录所在的日期节；新记录为写入的日期。 */
  date: string
  onSave: (draft: MessageDraft) => void | Promise<void>
  onClose: () => void
  onDelete?: () => void
  onAddAttachments?: (files: File[]) => Promise<Attachment[]>
  availableTags?: string[]
  initialTab?: Tab
  selectedQuote?: string
  draftKey?: string
}

export function JournalEditor({
  message,
  date,
  onSave,
  onClose,
  onDelete,
  onAddAttachments,
  availableTags,
  initialTab = 'body',
  selectedQuote,
  draftKey,
}: JournalEditorProps) {
  const initial = useRef(createMessageDraft(message, date))
  const [storedDraft] = useState<StoredEditorDraft | null>(() => {
    if (draftKey) {
      const saved = localStorage.getItem(`dialogary:editor:${draftKey}`)
      if (saved) {
        try {
          const stored = JSON.parse(saved) as StoredEditorDraft
          if (stored.draft && typeof stored.source === 'string') return stored
        } catch {
          /* 浏览器旧草稿损坏时继续使用文件中的记录。 */
        }
      }
    }
    return null
  })
  const [recoveredDraft, setRecoveredDraft] = useState<StoredEditorDraft | null>(() =>
    storedDraft?.source !== editableSource(initial.current) ? storedDraft : null,
  )
  const [draft, setDraft] = useState<MessageDraft>(() => {
    if (storedDraft?.source === editableSource(initial.current))
      return { ...storedDraft.draft, original: message ?? undefined }
    if (selectedQuote)
      return {
        ...initial.current,
        annotations: [
          ...(initial.current.annotations ?? []),
          {
            id: `note_${crypto.randomUUID()}`,
            text: '',
            quote: selectedQuote,
            createdAt: new Date().toISOString(),
          },
        ],
      }
    return initial.current
  })
  const [tab, setTab] = useState<Tab>(
    storedDraft?.source === editableSource(initial.current)
      ? (storedDraft.tab ?? initialTab)
      : initialTab,
  )
  const [sourcePreview, setSourcePreview] = useState(false)
  const [source, setSource] = useState(() =>
    storedDraft?.source === editableSource(initial.current)
      ? (storedDraft.rawSource ?? editableSource(draft))
      : editableSource(draft),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingAttachments, setAddingAttachments] = useState(false)
  const [discard, setDiscard] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    editableSource(draft) !== editableSource(initial.current) ||
    (tab === 'source' && source !== editableSource(draft))
  const [autosaveError, setAutosaveError] = useState(false)

  useEffect(() => {
    if (!draftKey) return
    // 正文撤销到原文时也同步清除自动草稿，避免下次打开又恢复已撤销的文字。
    if (!dirty) {
      if (!recoveredDraft) {
        try {
          localStorage.removeItem(`dialogary:editor:${draftKey}`)
        } catch {
          setAutosaveError(true)
        }
      }
      return
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          `dialogary:editor:${draftKey}`,
          JSON.stringify({
            draft,
            source: editableSource(initial.current),
            rawSource: tab === 'source' ? source : undefined,
            tab,
          }),
        )
        setAutosaveError(false)
      } catch {
        setAutosaveError(true)
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, draftKey, source, tab, recoveredDraft])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const close = () => {
    if (busy || addingAttachments) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(`dialogary:editor:${draftKey}`)
  }
  const changeTab = (next: Tab) => {
    if (!formRef.current?.reportValidity()) return
    try {
      if (tab === 'source') setDraft(readSource(source, draft))
      if (next === 'source') setSource(editableSource(draft))
      setTab(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON 格式不正确。')
    }
  }
  const save = async () => {
    if (addingAttachments) return
    if (!formRef.current?.reportValidity()) return
    setBusy(true)
    setError('')
    try {
      const next = tab === 'source' ? readSource(source, draft) : draft
      if (next.attachments.some((attachment) => !attachment.name.trim()))
        throw new Error('请为每个附件填写显示名称。')
      const usage = next.usage
      if (
        usage &&
        Object.values(usage).some(
          (value) => typeof value === 'number' && (!Number.isInteger(value) || value < 0),
        )
      )
        throw new Error('Token 用量需要填写 0 或正整数。')
      if (
        (usage?.cache_read_tokens ?? 0) + (usage?.cache_write_tokens ?? 0) >
        (usage?.input_tokens ?? Infinity)
      )
        throw new Error('缓存读取与写入的合计不能超过完整输入量。')
      if ((usage?.reasoning_tokens ?? 0) > (usage?.output_tokens ?? Infinity))
        throw new Error('推理用量不能超过完整输出量。')
      const normalizedTime = next.time?.replace('T', ' ') || null
      await onSave({
        ...next,
        time: normalizedTime,
        timePrecision: timePrecisionOf(normalizedTime),
      })
      clearDraft()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  const answerParts =
    draft.parts
      ?.map((part, index) => ({ part, index }))
      .filter(({ part }) => part.kind === 'answer') ?? []
  const parts = draftParts(draft)
  const fromAi = draft.role === 'ai'
  // 「我」的记录没有思考与检索；已有过程块或正文与附件交错时，仍保留调整顺序的入口。
  const hasProcess = parts.some((part) => part.kind !== 'answer' && part.kind !== 'attachment')
  const showParts = fromAi || hasProcess || parts.length > 1
  const visibleTab: Tab = tab === 'parts' && !showParts ? 'body' : tab
  const clock = clockOf(draft.time)
  const timeDay = draft.time?.slice(0, 10) ?? ''
  const crossDay = Boolean(draft.date && timeDay && timeDay !== draft.date)

  return (
    <EditorDialog
      drawer
      fixedHeight
      title={message ? '编辑记录' : '写一段记录'}
      subtitle={message ? '让这段记忆更完整。' : '此刻的生活与想法，都值得记下来。'}
      onClose={close}
      footer={
        <>
          {deleteConfirm ? (
            <div role="alert" className="flex w-full flex-wrap items-center gap-2">
              <span className="mr-auto text-sm">删除这条记录？</span>
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => setDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  clearDraft()
                  onDelete?.()
                  onClose()
                }}
              >
                删除记录
              </button>
            </div>
          ) : (
            <>
              {onDelete && (
                <button
                  type="button"
                  aria-label="删除记录"
                  className={`${mutedButtonClass} mr-auto`}
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 size={16} />
                </button>
              )}
              {!onDelete && (
                <span className="mr-auto text-xs text-neutral-400">
                  {draftKey && dirty
                    ? autosaveError
                      ? '草稿未能保存，请及时保存记录'
                      : '草稿自动保存在此浏览器'
                    : 'Ctrl / ⌘ + Enter 保存'}
                </span>
              )}
              <button type="button" className={mutedButtonClass} onClick={close}>
                取消
              </button>
              <button
                type="submit"
                form={formId}
                disabled={busy || addingAttachments}
                className={primaryButtonClass}
              >
                <Check size={16} />
                {addingAttachments ? '正在添加附件…' : busy ? '正在保存…' : '保存记录'}
              </button>
            </>
          )}
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void save()
          }
        }}
      >
        {recoveredDraft && (
          <div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
            <p>找到一份未完成的草稿，原记录在此期间有过修改。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  setDraft({
                    ...recoveredDraft.draft,
                    original: message ?? undefined,
                    _source: initial.current._source,
                  })
                  if (recoveredDraft.rawSource) {
                    setSource(recoveredDraft.rawSource)
                    setTab('source')
                  }
                  setRecoveredDraft(null)
                }}
              >
                恢复草稿
              </button>
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  setRecoveredDraft(null)
                  clearDraft()
                }}
              >
                使用当前记录
              </button>
            </div>
          </div>
        )}
        <div className="mb-5 grid grid-cols-[7rem_1fr] gap-3 sm:grid-cols-[7rem_1fr_1fr]">
          <Field label="记录人">
            {draft.role === 'system' ? (
              <input aria-label="记录人" className={fieldClass} value="系统提示" readOnly />
            ) : (
              <Select
                aria-label="记录人"
                value={draft.role}
                className="w-full"
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value as Message['role'] })
                }
                options={[
                  { value: 'user', label: '我' },
                  { value: 'ai', label: 'AI' },
                ]}
              />
            )}
          </Field>
          <Field label="日期">
            <input
              type="date"
              required={!message}
              value={draft.date}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  date: event.target.value,
                  // 换到另一天时，时间随记录一起移动，只保留时刻。
                  time:
                    draft.time && event.target.value
                      ? event.target.value + draft.time.slice(10)
                      : draft.time,
                })
              }
              className={fieldClass}
            />
          </Field>
          <div className="col-span-2 sm:col-span-1">
            <Field label="时间（可留空）">
              <input
                type="time"
                step={clock.length > 5 ? 1 : 60}
                value={clock}
                disabled={!draft.date && !draft.time}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    time: withClock(
                      draft.time,
                      draft.date,
                      event.target.value,
                      initial.current.time?.length === 10,
                    ),
                  })
                }
                className={fieldClass}
              />
            </Field>
            {crossDay && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs leading-5 text-neutral-500">
                <span>时间记在 {formatDateCn(timeDay)}</span>
                <button
                  type="button"
                  className="text-[var(--dg-accent)] hover:underline"
                  onClick={() => setDraft({ ...draft, time: draft.date + draft.time!.slice(10) })}
                >
                  改为 {formatDateCn(draft.date)}
                </button>
              </p>
            )}
          </div>
        </div>
        <nav
          aria-label="编辑内容"
          className="sticky top-0 z-10 -mx-1 mb-6 grid auto-cols-fr grid-flow-col gap-1 bg-white py-2 dark:bg-neutral-900 sm:flex"
        >
          {tabs.map((item) =>
            item.id === 'parts' && !showParts ? null : (
              <button
                type="button"
                key={item.id}
                aria-pressed={visibleTab === item.id}
                onClick={() => changeTab(item.id)}
                className={clsx(
                  'min-w-0 shrink-0 rounded-xl px-1 py-2 text-xs transition sm:px-3 sm:text-sm',
                  visibleTab === item.id
                    ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100',
                )}
              >
                {item.id === 'parts' && !fromAi && !hasProcess ? '顺序' : item.label}
                {item.id === 'annotations' && !!draft.annotations?.length
                  ? ` ${draft.annotations.length}`
                  : item.id === 'attachments' && !!draft.attachments.length
                    ? ` ${draft.attachments.length}`
                    : ''}
              </button>
            ),
          )}
        </nav>
        <div hidden={visibleTab !== 'body'} className="space-y-4">
          {(answerParts.length
            ? answerParts
            : [{ part: { kind: 'answer', text: draft.content } as MessagePart, index: -1 }]
          ).map(({ part, index }, i) => (
            <MarkdownEditor
              key={i === 0 ? 'primary-answer' : (part.id ?? index)}
              label={i === 0 ? '正文' : `正文 ${i + 1}`}
              autoFocus={i === 0}
              active={visibleTab === 'body'}
              value={part.text ?? ''}
              onChange={(content) =>
                setDraft((current) => {
                  if (index >= 0)
                    return withParts(
                      current,
                      current.parts!.map((value, n) =>
                        n === index ? { ...value, text: content } : value,
                      ),
                    )
                  return current.parts?.length
                    ? withParts(current, [...current.parts, { kind: 'answer', text: content }])
                    : { ...current, content }
                })
              }
            />
          ))}
        </div>
        {visibleTab === 'details' && (
          <DetailsEditor draft={draft} onChange={setDraft} tags={availableTags} />
        )}
        {visibleTab === 'parts' && (
          <PartsEditor
            parts={parts}
            processKinds={fromAi}
            onChange={(next) => setDraft(withParts(draft, next))}
          />
        )}
        {visibleTab === 'annotations' && (
          <AnnotationsEditor
            annotations={draft.annotations ?? []}
            onChange={(annotations) => setDraft({ ...draft, annotations })}
            selectedQuote={selectedQuote}
          />
        )}
        {visibleTab === 'attachments' && (
          <AttachmentsEditor
            attachments={draft.attachments}
            onChange={(attachments) => setDraft((current) => ({ ...current, attachments }))}
            onAddFiles={onAddAttachments}
            onBusyChange={setAddingAttachments}
          />
        )}
        {visibleTab === 'source' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-5 text-neutral-500">
                这条记录的完整数据，包括正文、过程、附件与扩展字段。修改整份 Markdown
                请使用「更多操作 → 编辑整个文件」。
              </p>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 text-xs leading-5 text-[var(--dg-accent)]"
                onClick={() => setSourcePreview(!sourcePreview)}
              >
                {sourcePreview ? <Pencil size={14} /> : <Eye size={14} />}
                {sourcePreview ? '编辑' : '预览'}
              </button>
            </div>
            {sourcePreview ? (
              <JsonPreview text={source} className="max-h-[52dvh]" />
            ) : (
              <textarea
                spellCheck={false}
                aria-label="记录 JSON"
                rows={22}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className={`${fieldClass} resize-y font-mono text-xs leading-6`}
              />
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </form>
      {discard && (
        <UnsavedChangesDialog
          onContinue={() => setDiscard(false)}
          onDiscard={() => {
            clearDraft()
            onClose()
          }}
          onKeepDraft={
            draftKey
              ? () => {
                  localStorage.setItem(
                    `dialogary:editor:${draftKey}`,
                    JSON.stringify({
                      draft,
                      source: editableSource(initial.current),
                      rawSource: tab === 'source' ? source : undefined,
                      tab,
                    }),
                  )
                  onClose()
                }
              : undefined
          }
        />
      )}
    </EditorDialog>
  )
}
