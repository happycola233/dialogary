import { useState } from 'react'
import { Bookmark, Pencil, Trash2 } from 'lucide-react'
import { EditorDialog, mutedButtonClass, primaryButtonClass } from './EditorDialog'

/** 单独进入 top layer，使长编辑表单中的关闭提示始终可见，并把 Escape 留给继续编辑。 */
export function UnsavedChangesDialog({
  onContinue,
  onDiscard,
  onKeepDraft,
}: {
  onContinue: () => void
  onDiscard: () => void
  onKeepDraft?: () => void | Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <EditorDialog
      alert
      title="还有未保存的修改"
      subtitle="这次编辑尚未应用到记录。"
      onClose={onContinue}
    >
      <div className="space-y-2 pt-2">
        <button
          type="button"
          data-editor-autofocus
          className={`${primaryButtonClass} w-full`}
          onClick={onContinue}
        >
          <Pencil size={16} />
          继续编辑
        </button>
        {onKeepDraft && (
          <button
            type="button"
            disabled={busy}
            className={`${mutedButtonClass} w-full`}
            onClick={async () => {
              setBusy(true)
              try {
                await onKeepDraft()
              } catch {
                setError('草稿未能保存，请继续编辑并保存记录。')
              } finally {
                setBusy(false)
              }
            }}
          >
            <Bookmark size={16} />
            {busy ? '正在保留…' : '保留草稿并关闭'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          className={`${mutedButtonClass} w-full !text-red-600 dark:!text-red-400`}
          onClick={onDiscard}
        >
          <Trash2 size={16} />
          放弃修改
        </button>
      </div>
      {onKeepDraft && (
        <p className="mt-4 text-center text-xs leading-5 text-neutral-500">
          草稿留在此浏览器，下次打开时继续。
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </EditorDialog>
  )
}
