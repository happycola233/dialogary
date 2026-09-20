import { useState } from 'react'
import { Check, Star, Trash2 } from 'lucide-react'
import type { Role } from '../parser/types'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from './EditorDialog'
import { TokenInput } from './TokenInput'
import { Select } from '../components/ui/Select'
import { MoodField } from './PresetPicker'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

export interface BatchPatch {
  addTags: string[]
  removeTags: string[]
  starred?: boolean
  mood?: string
  states?: string[]
  role?: Role
  date?: string
}

export function BatchEditDialog({
  count,
  availableTags = [],
  onApply,
  onDelete,
  onClose,
}: {
  count: number
  availableTags?: string[]
  onApply: (patch: BatchPatch) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}) {
  const [patch, setPatch] = useState<BatchPatch>({ addTags: [], removeTags: [] })
  const [moodEnabled, setMoodEnabled] = useState(false)
  const [statesEnabled, setStatesEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [discard, setDiscard] = useState(false)
  const changed =
    patch.addTags.length > 0 ||
    patch.removeTags.length > 0 ||
    patch.starred !== undefined ||
    patch.role !== undefined ||
    !!patch.date ||
    moodEnabled ||
    statesEnabled
  const close = () => {
    if (busy) return
    if (changed) setDiscard(true)
    else onClose()
  }
  const update = (value: Partial<BatchPatch>) => setPatch({ ...patch, ...value })
  return (
    <EditorDialog
      title={`整理 ${count} 条记录`}
      subtitle="选择要统一修改的内容。"
      onClose={close}
      footer={
        deleteConfirm ? (
          <>
            <span className="mr-auto text-sm">删除选中的 {count} 条记录？</span>
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
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onDelete?.()
                  onClose()
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '删除失败。')
                } finally {
                  setBusy(false)
                }
              }}
            >
              删除记录
            </button>
          </>
        ) : (
          <>
            {onDelete && (
              <button
                type="button"
                className={`${mutedButtonClass} mr-auto`}
                aria-label="删除所选记录"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" className={mutedButtonClass} onClick={close}>
              取消
            </button>
            <button
              type="button"
              disabled={!changed || busy}
              className={primaryButtonClass}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  await onApply({
                    ...patch,
                    mood: moodEnabled ? (patch.mood ?? '') : undefined,
                    states: statesEnabled ? (patch.states ?? []) : undefined,
                  })
                  onClose()
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '保存失败。')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Check size={16} />
              {busy ? '正在保存…' : '保存修改'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <TokenInput
          label="添加标签"
          presetKind="tags"
          values={patch.addTags}
          onChange={(addTags) => update({ addTags })}
          suggestions={availableTags.slice(0, 12)}
        />
        <TokenInput
          label="移除标签"
          presetKind="tags"
          values={patch.removeTags}
          onChange={(removeTags) => update({ removeTags })}
          suggestions={availableTags.slice(0, 12)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="收藏">
            <Select
              value={patch.starred === undefined ? '' : String(patch.starred)}
              onChange={(event) =>
                update({
                  starred: event.target.value === '' ? undefined : event.target.value === 'true',
                })
              }
              className="w-full"
              options={[
                { value: '', label: '保持原样' },
                { value: 'true', label: '全部收藏' },
                { value: 'false', label: '取消收藏' },
              ]}
            />
          </Field>
          <Field label="记录人">
            <Select
              value={patch.role ?? ''}
              onChange={(event) =>
                update({ role: event.target.value ? (event.target.value as Role) : undefined })
              }
              className="w-full"
              options={[
                { value: '', label: '保持原样' },
                { value: 'user', label: '我' },
                { value: 'ai', label: 'AI' },
              ]}
            />
          </Field>
        </div>
        <Field label="移动到日期">
          <input
            type="date"
            value={patch.date ?? ''}
            onChange={(event) => update({ date: event.target.value || undefined })}
            className={fieldClass}
          />
        </Field>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--dg-accent)]"
              checked={moodEnabled}
              onChange={(event) => setMoodEnabled(event.target.checked)}
            />
            统一修改心情
          </label>
          {moodEnabled && (
            <MoodField
              value={patch.mood ?? ''}
              onChange={(mood) => update({ mood })}
              placeholder="留空会清除心情"
            />
          )}
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--dg-accent)]"
              checked={statesEnabled}
              onChange={(event) => setStatesEnabled(event.target.checked)}
            />
            统一修改状态
          </label>
          {statesEnabled && (
            <TokenInput
              label="状态"
              presetKind="states"
              values={patch.states ?? []}
              onChange={(states) => update({ states })}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      {discard && <UnsavedChangesDialog onContinue={() => setDiscard(false)} onDiscard={onClose} />}
    </EditorDialog>
  )
}

export function SelectionBar({
  count,
  allSelected = false,
  onEdit,
  onStar,
  onClear,
  onSelectAll,
}: {
  count: number
  allSelected?: boolean
  onEdit: () => void
  onStar?: () => void
  onClear: () => void
  onSelectAll?: () => void
}) {
  return (
    <div
      role="region"
      aria-label="所选记录操作"
      className="dg-selection-bar fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl px-3 py-2"
    >
      <span className="whitespace-nowrap px-2 text-xs">已选 {count} 条</span>
      {onSelectAll && (
        <button
          type="button"
          className="whitespace-nowrap rounded-lg px-2 py-2 text-xs hover:bg-[var(--dg-accent-soft)]"
          onClick={onSelectAll}
          aria-pressed={allSelected}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      )}
      <button
        type="button"
        disabled={!count}
        onClick={onEdit}
        className="whitespace-nowrap rounded-lg bg-[var(--dg-accent-soft)] px-3 py-2 text-xs text-[var(--dg-accent)] disabled:opacity-40"
      >
        整理
      </button>
      {onStar && (
        <button
          type="button"
          aria-label="收藏所选记录"
          disabled={!count}
          onClick={onStar}
          className="rounded-lg p-2 hover:bg-[var(--dg-accent-soft)] disabled:opacity-40"
        >
          <Star size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        className="whitespace-nowrap rounded-lg px-2 py-2 text-xs opacity-70 hover:opacity-100"
      >
        完成
      </button>
    </div>
  )
}
