import { Check, Copy, Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard'
import { showToast } from '../lib/toast'
import { loadSavedTemplate, PRESETS, saveTemplate } from '../export/presets'
import { renderExport, type ExportScope, type ExportTemplate, type RoleTemplate } from '../export/template'
import { useAppStore } from '../model/store'
import clsx from 'clsx'

type ScopeKind = 'all' | 'user' | 'ai' | 'range'

export function ExportDialog() {
  const open = useAppStore((s) => s.exportOpen)
  const setOpen = useAppStore((s) => s.setExportOpen)
  const doc = useAppStore((s) => s.doc)
  const [template, setTemplate] = useState<ExportTemplate>(() => loadSavedTemplate() ?? PRESETS[0]!.template)
  const [scopeKind, setScopeKind] = useState<ScopeKind>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && doc) {
      setFrom(doc.sessions.find((s) => s.date)?.date ?? '')
      setTo([...doc.sessions].reverse().find((s) => s.date)?.date ?? '')
    }
  }, [open, doc])

  const scope: ExportScope = useMemo(() => {
    if (scopeKind === 'range' && from && to) return { kind: 'range', from, to }
    if (scopeKind === 'user' || scopeKind === 'ai') return { kind: 'filtered', role: scopeKind }
    return { kind: 'all' }
  }, [scopeKind, from, to])

  const output = useMemo(() => (doc && open ? renderExport(doc, template, scope) : ''), [doc, open, template, scope])

  if (!open || !doc) return null

  const update = (patch: Partial<ExportTemplate>) => {
    const next = { ...template, ...patch }
    setTemplate(next)
    saveTemplate(next)
  }
  const updateRole = (role: 'user' | 'ai', patch: Partial<RoleTemplate>) => {
    update({ [role]: { ...template[role], ...patch } })
  }

  const download = () => {
    const blob = new Blob([output], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${doc.title}-导出.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copy = async () => {
    const ok = await copyToClipboard(output)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } else {
      showToast('复制失败')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-indigo-500'
  const labelCls = 'text-xs text-neutral-500 dark:text-neutral-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-0 backdrop-blur-[2px] sm:p-6" onClick={() => setOpen(false)}>
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[88vh] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-neutral-200 sm:shadow-2xl dark:bg-neutral-900 dark:sm:border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-700/80">
          <h2 className="text-sm font-semibold">导出 Markdown</h2>
          <button type="button" onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
            <X size={15} />
          </button>
        </div>

        <div className="hc-scrollbar grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,24rem)_1fr] md:overflow-hidden">
          {/* 选项列 */}
          <div className="hc-scrollbar flex flex-col gap-4 border-b border-neutral-200/80 p-4 md:overflow-y-auto md:border-r md:border-b-0 dark:border-neutral-700/60">
            <div>
              <div className={labelCls}>预设</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setTemplate(p.template)
                      saveTemplate(p.template)
                    }}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className={labelCls}>范围</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['all', '全部'],
                    ['user', '仅我的消息'],
                    ['ai', '仅 AI'],
                    ['range', '日期区间'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScopeKind(k)}
                    className={clsx(
                      'rounded-lg px-2.5 py-1 text-xs transition-colors',
                      scopeKind === k
                        ? 'bg-indigo-500 text-white dark:bg-indigo-500/80'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scopeKind === 'range' && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                  <span className="text-neutral-400">–</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>

            {(['user', 'ai'] as const).map((role) => {
              const rt = template[role]
              const disabled = (scopeKind === 'user' && role === 'ai') || (scopeKind === 'ai' && role === 'user')
              return (
                <fieldset key={role} disabled={disabled} className={clsx('rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-700/60', disabled && 'opacity-40')}>
                  <label className="flex items-center gap-2 text-[13px] font-medium">
                    <input
                      type="checkbox"
                      checked={rt.include}
                      onChange={(e) => updateRole(role, { include: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    {role === 'user' ? '🧑‍💻 我的消息' : '🤖 AI 消息'}
                  </label>
                  <div className="mt-2.5 flex flex-col gap-2">
                    <div>
                      <div className={labelCls}>标题行</div>
                      <input value={rt.header} onChange={(e) => updateRole(role, { header: e.target.value })} className={clsx(inputCls, 'mt-1 font-mono')} />
                    </div>
                    <div>
                      <div className={labelCls}>元信息（可多行）</div>
                      <textarea
                        value={rt.metaLines}
                        onChange={(e) => updateRole(role, { metaLines: e.target.value })}
                        rows={2}
                        className={clsx(inputCls, 'mt-1 resize-y font-mono')}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {role === 'ai' && (
                        <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          <input
                            type="checkbox"
                            checked={rt.includeThinking}
                            onChange={(e) => updateRole(role, { includeThinking: e.target.checked })}
                            className="accent-indigo-500"
                          />
                          含思考摘要
                        </label>
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <input
                          type="checkbox"
                          checked={rt.includeAttachments}
                          onChange={(e) => updateRole(role, { includeAttachments: e.target.checked })}
                          className="accent-indigo-500"
                        />
                        含附件行
                      </label>
                    </div>
                  </div>
                </fieldset>
              )
            })}

            <div className="grid grid-cols-1 gap-2">
              <div>
                <div className={labelCls}>日期节标题（留空 = 不输出）</div>
                <input value={template.sessionHeading} onChange={(e) => update({ sessionHeading: e.target.value })} className={clsx(inputCls, 'mt-1 font-mono')} />
              </div>
              <div>
                <div className={labelCls}>消息分隔行</div>
                <input value={template.separator} onChange={(e) => update({ separator: e.target.value })} className={clsx(inputCls, 'mt-1 font-mono')} />
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
              可用变量：{'{content} {time} {date} {weekday} {timeOfDay} {model} {title} {thinkingLabel} {index}'}
              ；某行引用的变量全部缺值时该行不输出。
            </p>
          </div>

          {/* 预览列 */}
          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                预览 · 共 {output.length.toLocaleString()} 字符
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? '已复制' : '复制'}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600 dark:bg-indigo-500/80 dark:hover:bg-indigo-500"
                >
                  <Download size={13} />
                  下载 .md
                </button>
              </div>
            </div>
            <pre className="hc-scrollbar min-h-40 flex-1 overflow-auto rounded-xl border border-neutral-200/80 bg-neutral-50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-600 dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-neutral-300">
              {output.length > 20000 ? output.slice(0, 20000) + '\n\n…（预览截断，导出为完整内容）' : output}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
