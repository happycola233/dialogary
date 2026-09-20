import { useState } from 'react'
import { ArrowRight, Settings2, Tags, Trash2 } from 'lucide-react'
import { PresetManagerDialog } from './PresetPicker'
import { usePersonalPresets } from '../model/presets'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from './EditorDialog'

export interface ManagedTag {
  name: string
  count: number
  color?: string
}

export function TagManagerDialog({
  tags,
  onRename,
  onRemove,
  onColor,
  onClose,
}: {
  tags: ManagedTag[]
  onRename: (from: string, to: string) => void | Promise<void>
  onRemove?: (tag: string) => void | Promise<void>
  onColor?: (tag: string, color: string) => void | Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const renamePreset = usePersonalPresets((state) => state.rename)
  const merge = tags.some((tag) => tag.name === name.trim() && tag.name !== selected)
  return (
    <EditorDialog
      title="整理标签"
      subtitle="重命名一个标签，所有使用它的记录都会一起更新。"
      onClose={onClose}
      footer={
        <button type="button" className={mutedButtonClass} onClick={onClose}>
          完成
        </button>
      }
    >
      <button
        type="button"
        className={`${mutedButtonClass} mb-4 w-full !justify-start bg-[var(--dg-accent-soft)] !text-[var(--dg-accent)]`}
        onClick={() => setPresetsOpen(true)}
      >
        <Settings2 size={16} />
        常用标签、心情与状态
      </button>
      <input
        aria-label="搜索标签"
        className={`${fieldClass} mb-4`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜索标签"
      />
      <div className="max-h-52 space-y-1 overflow-y-auto">
        {tags
          .filter((tag) => tag.name.toLowerCase().includes(search.toLowerCase()))
          .map((tag) => (
            <button
              type="button"
              key={tag.name}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${selected === tag.name ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent)] dark:bg-[var(--dg-accent-soft)] dark:text-[var(--dg-accent)]' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
              onClick={() => {
                setSelected(tag.name)
                setName(tag.name)
                setRemoveConfirm(false)
                setError('')
              }}
            >
              <Tags size={15} style={tag.color ? { color: tag.color } : undefined} />
              <span className="flex-1">{tag.name}</span>
              <span className="text-xs text-neutral-400">{tag.count}</span>
            </button>
          ))}
      </div>
      {tags.length === 0 && (
        <p className="py-12 text-center text-sm text-neutral-400">
          给记录添加标签后，就可以在这里整理。
        </p>
      )}
      {selected && (
        <div className="mt-6 space-y-4">
          <Field label="新的标签名称">
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {merge && (
            <p className="text-xs text-neutral-500">
              「{selected}」将合并到已有标签「{name.trim()}」。
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {onColor && (
              <label className="mr-auto flex items-center gap-2 text-xs text-neutral-500">
                颜色
                <input
                  aria-label="标签颜色"
                  type="color"
                  className="h-8 w-8 cursor-pointer border-0 bg-transparent"
                  value={tags.find((tag) => tag.name === selected)?.color ?? '#6d9bbc'}
                  onChange={(event) => {
                    void onColor(selected, event.target.value)
                  }}
                />
              </label>
            )}
            {onRemove && (
              <button
                type="button"
                className={mutedButtonClass}
                disabled={busy}
                onClick={() => setRemoveConfirm(true)}
              >
                <Trash2 size={15} />
                移除标签
              </button>
            )}
            <button
              type="button"
              className={primaryButtonClass}
              disabled={busy || !name.trim() || name.trim() === selected}
              onClick={async () => {
                setBusy(true)
                try {
                  await onRename(selected, name.trim())
                  renamePreset('tags', selected, name.trim())
                  setSelected(name.trim())
                  setError('')
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '标签更新失败。')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <ArrowRight size={15} />
              {merge ? '合并标签' : '重命名'}
            </button>
          </div>
          {removeConfirm && (
            <div role="alert" className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
              <p className="mb-3 text-sm">从所有记录移除「{selected}」？记录正文会保留。</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={mutedButtonClass}
                  onClick={() => setRemoveConfirm(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl px-3 py-2 text-sm text-red-600"
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onRemove?.(selected)
                      setSelected(null)
                      setRemoveConfirm(false)
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : '标签移除失败。')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  移除
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {presetsOpen && <PresetManagerDialog onClose={() => setPresetsOpen(false)} />}
    </EditorDialog>
  )
}
