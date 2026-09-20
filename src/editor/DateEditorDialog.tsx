import { useId, useState } from 'react'
import { Check } from 'lucide-react'
import type { Session } from '../parser/types'
import { AnnotationsEditor } from './AnnotationsEditor'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from './EditorDialog'
import { TokenInput } from './TokenInput'
import { ReactionField } from '../components/ReactionPicker'
import { MoodField } from './PresetPicker'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { useAppStore } from '../model/store'

function dayFields(session: Session) {
  const { messages: _messages, _source, ...fields } = session
  return fields
}

export function DateEditorDialog({
  session,
  onSave,
  onClose,
  availableTags = [],
}: {
  session: Session
  onSave: (session: Session) => void | Promise<void>
  onClose: () => void
  availableTags?: string[]
}) {
  const sourceKey = useAppStore((state) => state.sourceKey)
  const storageKey = `dialogary:day-editor:${sourceKey}:${session.id ?? session.line}`
  const original = JSON.stringify(dayFields(session))
  const [stored] = useState<{ original: string; value: Partial<Session> } | null>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      return data &&
        typeof data.original === 'string' &&
        data.value &&
        typeof data.value === 'object'
        ? data
        : null
    } catch {
      return null
    }
  })
  const [recovery, setRecovery] = useState(stored && stored.original !== original ? stored : null)
  const [draft, setDraft] = useState(() => ({
    ...structuredClone(session),
    ...(stored?.original === original ? stored.value : {}),
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)
  const formId = useId()
  const patch = (value: Partial<Session>) => setDraft({ ...draft, ...value })
  const close = () => {
    if (busy) return
    if (JSON.stringify(dayFields(draft)) !== original) setDiscard(true)
    else onClose()
  }
  return (
    <EditorDialog
      title="这一天"
      subtitle="给一天起个名字，记下它的心情。"
      onClose={close}
      footer={
        <>
          <button type="button" className={mutedButtonClass} onClick={close}>
            取消
          </button>
          <button type="submit" form={formId} disabled={busy} className={primaryButtonClass}>
            <Check size={16} />
            {busy ? '正在保存…' : '保存'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            await onSave(draft)
            localStorage.removeItem(storageKey)
            onClose()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
          } finally {
            setBusy(false)
          }
        }}
      >
        {recovery && (
          <div className="rounded-xl bg-[var(--dg-accent-soft)] p-3 text-sm">
            <p>找到一份未完成的草稿，这一天的记录已有修改。</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  setDraft({ ...draft, ...recovery.value })
                  setRecovery(null)
                }}
              >
                恢复草稿
              </button>
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  localStorage.removeItem(storageKey)
                  setRecovery(null)
                }}
              >
                使用当前记录
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="日期">
            <input
              autoFocus
              data-editor-autofocus
              type="date"
              value={draft.date ?? ''}
              onChange={(event) => patch({ date: event.target.value || null })}
              className={fieldClass}
            />
          </Field>
          <Field label="标题">
            <input
              value={draft.title ?? ''}
              onChange={(event) => patch({ title: event.target.value || null })}
              placeholder="给这一天起个名字"
              className={fieldClass}
            />
          </Field>
        </div>
        <TokenInput
          label="标签"
          presetKind="tags"
          values={draft.tags ?? []}
          onChange={(tags) => patch({ tags })}
          suggestions={availableTags.slice(0, 10)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoodField
            value={draft.mood ?? ''}
            onChange={(mood) => patch({ mood })}
            placeholder="今天过得怎么样"
          />
          <TokenInput
            label="状态"
            presetKind="states"
            values={draft.states ?? []}
            onChange={(states) => patch({ states })}
          />
        </div>
        <ReactionField
          values={draft.reactions ?? []}
          onChange={(reactions) => patch({ reactions })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--dg-accent)]"
            checked={draft.starred ?? false}
            onChange={(event) => patch({ starred: event.target.checked })}
          />
          收藏这一天
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
            当天备注{draft.annotations?.length ? ` · ${draft.annotations.length}` : ''}
          </summary>
          <div className="mt-4">
            <AnnotationsEditor
              annotations={draft.annotations ?? []}
              onChange={(annotations) => patch({ annotations })}
            />
          </div>
        </details>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
      {discard && (
        <UnsavedChangesDialog
          onContinue={() => setDiscard(false)}
          onDiscard={() => {
            localStorage.removeItem(storageKey)
            onClose()
          }}
          onKeepDraft={() => {
            localStorage.setItem(storageKey, JSON.stringify({ original, value: dayFields(draft) }))
            onClose()
          }}
        />
      )}
    </EditorDialog>
  )
}
