import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import './editor-polish.css'

export const fieldClass =
  'hc-scrollbar w-full min-w-0 rounded-xl bg-neutral-100/80 px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:ring-2 focus:ring-inset focus:ring-[var(--dg-accent)] dark:bg-neutral-800/80 dark:text-neutral-100'
export const mutedButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-[var(--dg-accent)] disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800'
export const primaryButtonClass =
  'dg-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dg-accent)] disabled:opacity-40'

/** 原生 dialog 负责焦点约束和背景 inert；退出前仍交给编辑器检查草稿。 */
export function EditorDialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide = false,
  drawer = false,
  alert = false,
  fixedHeight = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
  drawer?: boolean
  alert?: boolean
  fixedHeight?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-editor-autofocus]')?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      previous?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={ref}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={clsx(
        'dg-editor-dialog fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-hidden rounded-3xl border-0 bg-white p-0 text-neutral-900 shadow-2xl outline-none backdrop:bg-neutral-950/30 backdrop:backdrop-blur-[3px] dark:bg-neutral-900 dark:text-neutral-100',
        fixedHeight
          ? 'h-[min(940px,92dvh)] max-w-[1080px]'
          : alert
            ? 'max-w-md'
            : wide
              ? 'max-w-5xl'
              : drawer
                ? 'max-w-4xl'
                : 'max-w-xl',
      )}
    >
      <section
        className={clsx('flex max-h-[92dvh] flex-col overflow-hidden', fixedHeight && 'h-full')}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-7">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className={mutedButtonClass}>
            <X size={18} />
          </button>
        </header>
        <div className="hc-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 pt-1 sm:px-7">
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-neutral-50/90 px-5 py-4 dark:bg-neutral-950/30 sm:px-7">
            {footer}
          </footer>
        )}
      </section>
    </dialog>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs leading-5 text-neutral-500">{hint}</span>}
    </label>
  )
}
