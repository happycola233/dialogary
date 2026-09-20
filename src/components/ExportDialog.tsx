import { Check, Copy, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { copyToClipboard } from '../lib/clipboard'
import { showToast } from '../lib/toast'
import { loadSavedTemplate, PRESETS, saveTemplate } from '../export/presets'
import { renderExport } from '../export/template'
import type { ExportScope, ExportTemplate, RoleTemplate } from '../export/template'
import type { DerivedDoc } from '../model/derive'
import { useAppStore } from '../model/store'
import { downloadText } from '../data/fileAccess'
import {
  EditorDialog,
  Field,
  fieldClass,
  mutedButtonClass,
  primaryButtonClass,
} from '../editor/EditorDialog'

export function ExportDialog() {
  const open = useAppStore((state) => state.exportOpen)
  const setOpen = useAppStore((state) => state.setExportOpen)
  const doc = useAppStore((state) => state.doc)
  return open && doc ? <ExportPanel doc={doc} onClose={() => setOpen(false)} /> : null
}

const presetLabels: Record<string, string> = {
  default: '对话',
  'user-only': '我的日记',
  qa: '简洁问答',
  full: '对话与思考',
}

function ExportPanel({ doc, onClose }: { doc: DerivedDoc; onClose: () => void }) {
  const [template, setTemplate] = useState<ExportTemplate>(
    () => loadSavedTemplate() ?? PRESETS[0]!.template,
  )
  const [roleScope, setRoleScope] = useState<ExportScope['role']>('all')
  const [rangeOn, setRangeOn] = useState(false)
  const [from, setFrom] = useState(doc.sessions.find((session) => session.date)?.date ?? '')
  const [to, setTo] = useState(
    [...doc.sessions].reverse().find((session) => session.date)?.date ?? '',
  )
  const [copied, setCopied] = useState(false)
  const [mobileTab, setMobileTab] = useState<'options' | 'preview'>('options')
  const scope = useMemo<ExportScope>(
    () => ({ role: roleScope, range: rangeOn && from && to ? { from, to } : null }),
    [roleScope, rangeOn, from, to],
  )
  const output = useMemo(() => renderExport(doc, template, scope), [doc, template, scope])
  const invalidRange = rangeOn && (!from || !to || from > to)
  const update = (patch: Partial<ExportTemplate>) => {
    const next = { ...template, ...patch }
    setTemplate(next)
    saveTemplate(next)
  }
  const updateRole = (role: 'user' | 'ai', patch: Partial<RoleTemplate>) =>
    update({ [role]: { ...template[role], ...patch } })
  const copy = async () => {
    if (await copyToClipboard(output)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } else showToast('复制失败，请重试')
  }
  return (
    <EditorDialog
      wide
      title="导出阅读稿"
      subtitle="选择喜欢的排版，带走这段时间的记录。"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs text-neutral-400">
            {output.length.toLocaleString()} 字符
          </span>
          <button
            type="button"
            className={mutedButtonClass}
            disabled={!output || invalidRange}
            onClick={() => {
              void copy()
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? '已复制' : '复制'}
          </button>
          <button
            type="button"
            disabled={!output || invalidRange}
            className={primaryButtonClass}
            onClick={() => downloadText(`${doc.title}-阅读稿.md`, output)}
          >
            <Download size={15} />
            下载 Markdown
          </button>
        </>
      }
    >
      <div className="mb-4 flex gap-1 md:hidden">
        {(['options', 'preview'] as const).map((tab) => (
          <button
            type="button"
            aria-pressed={mobileTab === tab}
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={clsx(
              mutedButtonClass,
              mobileTab === tab && 'bg-neutral-100 dark:bg-neutral-800',
            )}
          >
            {tab === 'options' ? '导出选项' : '预览内容'}
          </button>
        ))}
      </div>
      <div className="grid gap-7 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className={clsx('space-y-5 md:block', mobileTab === 'preview' && 'hidden')}>
          <section>
            <h3 className="mb-2 text-xs text-neutral-500">排版</h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset, index) => (
                <button
                  type="button"
                  data-editor-autofocus={index === 0 ? true : undefined}
                  key={preset.id}
                  onClick={() => {
                    setTemplate(preset.template)
                    saveTemplate(preset.template)
                  }}
                  className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 transition hover:bg-[var(--dg-accent-soft)] hover:text-[var(--dg-accent)] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-[var(--dg-accent-soft)] dark:hover:text-[var(--dg-accent)]"
                >
                  {presetLabels[preset.id] ?? preset.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-xs text-neutral-500">记录范围</h3>
            <div className="flex gap-1.5">
              {(
                [
                  ['all', '全部'],
                  ['user', '只看我'],
                  ['ai', '只看 AI'],
                ] as const
              ).map(([role, label]) => (
                <button
                  type="button"
                  key={role}
                  aria-pressed={roleScope === role}
                  onClick={() => setRoleScope(role)}
                  className={clsx(
                    'rounded-lg px-3 py-2 text-xs',
                    roleScope === role
                      ? 'bg-[var(--dg-accent-fill)] text-[var(--dg-accent-strong)] dark:bg-[var(--dg-accent-fill)]'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--dg-accent)]"
                checked={rangeOn}
                onChange={(event) => setRangeOn(event.target.checked)}
              />
              选择一段日期
            </label>
            {rangeOn && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="开始日期">
                  <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="结束日期">
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
            )}
            {invalidRange && (
              <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                请选择完整的日期范围，结束日期应晚于或等于开始日期。
              </p>
            )}
          </section>
          <details>
            <summary className="cursor-pointer py-1 text-sm text-neutral-600 dark:text-neutral-300">
              自定义排版
            </summary>
            <div className="mt-4 space-y-6">
              {(['user', 'ai'] as const).map((role) => (
                <RoleOptions
                  key={role}
                  role={role}
                  template={template[role]}
                  disabled={roleScope !== 'all' && roleScope !== role}
                  onChange={(patch) => updateRole(role, patch)}
                />
              ))}
              <Field label="日期标题">
                <input
                  value={template.sessionHeading}
                  onChange={(event) => update({ sessionHeading: event.target.value })}
                  className={`${fieldClass} font-mono text-xs`}
                  placeholder="留空则不显示日期标题"
                />
              </Field>
              <Field label="记录分隔符">
                <input
                  value={template.separator}
                  onChange={(event) => update({ separator: event.target.value })}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </Field>
              <details>
                <summary className="cursor-pointer text-xs text-neutral-400">
                  插入时间、模型等内容
                </summary>
                <p className="mt-2 break-words text-xs leading-6 text-neutral-500">
                  {
                    '{content} 正文 · {time} 时间 · {date} 日期 · {weekday} 星期 · {timeOfDay} 时分 · {model} 模型 · {title} 日期标题 · {thinkingLabel} 思考标题 · {index} 序号'
                  }
                </p>
              </details>
            </div>
          </details>
        </div>
        <div className={clsx('min-w-0 md:block', mobileTab === 'options' && 'hidden')}>
          <p className="mb-3 text-xs text-neutral-400">Markdown 预览</p>
          <pre
            tabIndex={0}
            aria-label="导出预览"
            className="hc-scrollbar max-h-[58dvh] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-600 dark:bg-neutral-800/45 dark:text-neutral-300"
          >
            {output
              ? output.length > 20000
                ? output.slice(0, 20000) + '\n\n…预览到这里，下载文件将包含全部内容。'
                : output
              : '这个范围里还没有可导出的记录。'}
          </pre>
        </div>
      </div>
    </EditorDialog>
  )
}

function RoleOptions({
  role,
  template,
  disabled,
  onChange,
}: {
  role: 'user' | 'ai'
  template: RoleTemplate
  disabled: boolean
  onChange: (patch: Partial<RoleTemplate>) => void
}) {
  return (
    <fieldset disabled={disabled} className={clsx('space-y-3', disabled && 'opacity-40')}>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={template.include}
          onChange={(event) => onChange({ include: event.target.checked })}
          className="accent-[var(--dg-accent)]"
        />
        {role === 'user' ? '我的记录' : 'AI 回复'}
      </label>
      <Field label={role === 'user' ? '我的记录标题' : 'AI 回复标题'}>
        <input
          value={template.header}
          onChange={(event) => onChange({ header: event.target.value })}
          className={`${fieldClass} font-mono text-xs`}
        />
      </Field>
      <Field label={role === 'user' ? '我的记录信息' : 'AI 回复信息'}>
        <textarea
          rows={2}
          value={template.metaLines}
          onChange={(event) => onChange({ metaLines: event.target.value })}
          className={`${fieldClass} resize-y font-mono text-xs`}
        />
      </Field>
      <div className="flex flex-wrap gap-4">
        {role === 'ai' && (
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={template.includeThinking}
              onChange={(event) => onChange({ includeThinking: event.target.checked })}
              className="accent-[var(--dg-accent)]"
            />
            包含思考过程
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={template.includeAttachments}
            onChange={(event) => onChange({ includeAttachments: event.target.checked })}
            className="accent-[var(--dg-accent)]"
          />
          包含附件链接
        </label>
      </div>
    </fieldset>
  )
}
