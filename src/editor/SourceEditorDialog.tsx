import { useEffect, useId, useState } from 'react'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { Check, FileCode2 } from 'lucide-react'
import { EditorDialog, fieldClass, mutedButtonClass, primaryButtonClass } from './EditorDialog'

export function SourceEditorDialog({
  source,
  onSave,
  onClose,
  title = '编辑源文件',
  validate,
  draftKey,
}: {
  source: string
  onSave: (source: string) => void | Promise<void>
  onClose: () => void
  title?: string
  validate?: (source: string) => string | null
  draftKey?: string
}) {
  const [stored] = useState<{ original: string; value: string } | null>(() => {
    if (!draftKey) return null
    const saved = localStorage.getItem(`dialogary:source-editor:${draftKey}`)
    if (!saved) return null
    try {
      const parsed = JSON.parse(saved) as { original: string; value: string }
      return typeof parsed.original === 'string' && typeof parsed.value === 'string' ? parsed : null
    } catch {
      return null
    }
  })
  const [value, setValue] = useState(stored?.original === source ? stored.value : source)
  const [recovery, setRecovery] = useState(stored?.original !== source ? stored : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [draftError, setDraftError] = useState(false)
  const formId = useId()
  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(`dialogary:source-editor:${draftKey}`)
  }
  useEffect(() => {
    if (value === source) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    const timer = window.setTimeout(() => {
      if (!draftKey) return
      try {
        localStorage.setItem(
          `dialogary:source-editor:${draftKey}`,
          JSON.stringify({ original: source, value }),
        )
        setDraftError(false)
      } catch {
        setDraftError(true)
      }
    }, 400)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.clearTimeout(timer)
    }
  }, [value, source, draftKey])
  const close = () => {
    if (busy) return
    if (value !== source) setDiscard(true)
    else onClose()
  }
  const save = async () => {
    const issue = validate?.(value)
    if (issue) {
      setError(issue)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave(value)
      clearDraft()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <EditorDialog
      wide
      title={title}
      subtitle="直接编辑 Markdown，保存后更新阅读视图。"
      onClose={close}
      footer={
        <>
          <span className="mr-auto flex items-center gap-2 text-xs text-neutral-400">
            <FileCode2 size={14} />
            {value.split('\n').length.toLocaleString()} 行
          </span>
          <button type="button" className={mutedButtonClass} onClick={close}>
            取消
          </button>
          <button type="submit" form={formId} disabled={busy} className={primaryButtonClass}>
            <Check size={16} />
            {busy ? '正在保存…' : '保存修改'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void save()
          }
        }}
      >
        {recovery && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p>找到未完成的草稿，文件已有新的修改。</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  setValue(recovery.value)
                  setRecovery(null)
                }}
              >
                恢复草稿
              </button>
              <button
                type="button"
                className={mutedButtonClass}
                onClick={() => {
                  clearDraft()
                  setRecovery(null)
                }}
              >
                使用当前文件
              </button>
            </div>
          </div>
        )}
        <textarea
          aria-label="Markdown 源文件"
          autoFocus
          data-editor-autofocus
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
          className={`${fieldClass} h-[62dvh] min-h-64 resize-none font-mono text-xs leading-6`}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {draftError && (
          <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            浏览器空间不足，请及时保存修改。
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
                    `dialogary:source-editor:${draftKey}`,
                    JSON.stringify({ original: source, value }),
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
