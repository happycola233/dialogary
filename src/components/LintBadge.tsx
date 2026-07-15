import { AlertTriangle, X } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../model/store'
import type { LintLevel } from '../parser/types'

const LEVEL_STYLE: Record<LintLevel, string> = {
  error: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
}

/** 解析/lint 问题徽标：仅在有 error/warn 时显示；点击展开问题列表 */
export function LintBadge() {
  const doc = useAppStore((s) => s.doc)
  const [open, setOpen] = useState(false)
  const issues = doc?.issues ?? []
  const visible = issues.filter((i) => i.level !== 'info')
  if (visible.length === 0) return null

  const hasError = visible.some((i) => i.level === 'error')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="格式检查发现的问题"
        className={clsx(
          'flex h-8 items-center gap-1 rounded-lg px-2 text-xs transition-colors',
          hasError
            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
            : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10',
        )}
      >
        <AlertTriangle size={14} />
        {visible.length}
      </button>
      {/* TopBar 的 backdrop-blur 会把 fixed 后代的包含块限制在 header 内并新建层叠上下文，
          正文 z-10 的吸顶元素会盖住弹窗 —— 必须 portal 到 body */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-3 pt-[12vh]" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-700/80">
              <h2 className="text-sm font-semibold">格式检查（{issues.length} 条）</h2>
              <button type="button" onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
                <X size={15} />
              </button>
            </div>
            <div className="hc-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {issues.map((it, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-2 text-[13px]">
                  <span className={clsx('mt-px shrink-0 rounded px-1.5 py-px text-[11px] font-medium', LEVEL_STYLE[it.level])}>
                    {it.level}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-neutral-400">行{it.line}</span>
                  <span className="min-w-0 text-neutral-600 dark:text-neutral-300">{it.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
