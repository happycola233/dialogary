import { Archive, Braces, FileText, NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EditorDialog, mutedButtonClass, primaryButtonClass } from '../editor/EditorDialog'
import { downloadBlob, downloadText } from '../data/fileAccess'
import { exportArchive } from '../export/archive'
import { serializeChatlog, migrateV1ToV2, parseChatlog } from '../parser/chatlog'
import { deriveDoc } from '../model/derive'
import { matchesFilters } from '../model/filters'
import { omitPrivateSource } from '../model/mutations'
import { useAppStore } from '../model/store'
import { PRESETS } from '../export/presets'
import { renderExport } from '../export/template'
import { Select } from './ui/Select'
import { JsonPreview } from './JsonPreview'

export function ArchiveDialog({
  onClose,
  initialFormat = 'v2',
}: {
  onClose: () => void
  initialFormat?: 'v2' | 'zip'
}) {
  const state = useAppStore()
  const [format, setFormat] = useState<string>(initialFormat)
  const [scope, setScope] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const doc = useMemo(() => {
    const document =
      state.rawDoc!.format === 'chatlog-md/1'
        ? parseChatlog(migrateV1ToV2(state.text).text)
        : structuredClone(state.rawDoc!)
    const included = new Set(
      state
        .doc!.messages.filter((message) =>
          scope === 'selection'
            ? state.selected.has(message.id)
            : scope === 'filtered'
              ? matchesFilters(message, state.filters) &&
                (state.filter === 'all' || state.filter === message.role) &&
                (state.readMode !== 'diary' || message.role === 'user')
              : true,
        )
        .map((message) => message.index),
    )
    let index = 0
    for (const session of document.sessions)
      session.messages = session.messages.filter(() => included.has(index++))
    if (scope !== 'all')
      document.sessions = document.sessions.filter((session) => session.messages.length)
    return document
  }, [
    state.rawDoc,
    state.text,
    state.doc,
    scope,
    state.selected,
    state.filters,
    state.filter,
    state.readMode,
  ])
  const text = useMemo(
    () =>
      format === 'diary'
        ? renderExport(
            deriveDoc(doc, []),
            PRESETS.find((item) => item.id === 'user-only')!.template,
            { role: 'user', range: null },
          )
        : serializeChatlog(doc),
    [doc, format],
  )
  const options = [
    {
      value: 'v2',
      label: '完整 Markdown',
      description: '保留模型、过程、标签与批注',
      icon: FileText,
    },
    {
      value: 'zip',
      label: '含附件归档',
      description: '日记与本地附件一起打包',
      icon: Archive,
    },
    {
      value: 'diary',
      label: '我的日记',
      description: '只导出自己写下的文字',
      icon: NotebookPen,
    },
    {
      value: 'json',
      label: '结构化 JSON',
      description: '完整内容，便于进一步处理',
      icon: Braces,
    },
  ]
  const preview = useMemo(
    () => (format === 'json' ? JSON.stringify(doc, omitPrivateSource, 2) : text),
    [doc, format, text],
  )
  const previewLimit = 20000
  return (
    <EditorDialog
      title="导出与归档"
      subtitle="让每一份记录，都能长久保存。"
      onClose={onClose}
      footer={
        <>
          <button
            className={`${mutedButtonClass} mr-auto`}
            onClick={() => {
              onClose()
              state.setExportOpen(true)
            }}
          >
            自定义阅读稿
          </button>
          <button
            className={primaryButtonClass}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                const name = state.sourceName ?? '日记.chat.md'
                if (format === 'zip')
                  await exportArchive(name, text, doc, state.assets, state.resolveAsset)
                else if (format === 'json')
                  downloadBlob(
                    name.replace(/\.md$/, '.json'),
                    new Blob([JSON.stringify(doc, omitPrivateSource, 2)], {
                      type: 'application/json',
                    }),
                  )
                else downloadText(format === 'diary' ? '我的日记.md' : name, text)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '导出未完成')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '正在打包…' : '下载文件'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ icon: Icon, ...item }) => (
          <button
            key={item.value}
            onClick={() => setFormat(item.value)}
            className={`rounded-2xl p-4 text-left transition ${format === item.value ? 'bg-[var(--dg-accent-soft)] ring-1 ring-[var(--dg-accent)] dark:bg-[var(--dg-accent-soft)]' : 'bg-neutral-50 dark:bg-neutral-800/50'}`}
            aria-pressed={format === item.value}
          >
            <Icon size={20} className="mb-4 text-[var(--dg-accent)] dark:text-[var(--dg-accent)]" />
            <span className="block text-sm font-medium">{item.label}</span>
            <span className="mt-1 block text-[11px] leading-5 text-neutral-400">
              {item.description}
            </span>
          </button>
        ))}
      </div>
      <label className="my-5 block text-xs text-neutral-500">
        导出范围
        <Select
          className="mt-2 w-full"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          options={[
            { value: 'all', label: '全部记录' },
            { value: 'filtered', label: '当前筛选结果' },
            {
              value: 'selection',
              label: `已选择的 ${state.selected.size} 条记录`,
              disabled: !state.selected.size,
            },
          ]}
        />
      </label>
      <p className="mb-2 text-xs text-neutral-400">
        {doc.sessions.flatMap((session) => session.messages).length} 条记录 · 内容预览
      </p>
      {format === 'json' ? (
        <JsonPreview text={preview.slice(0, previewLimit)} className="max-h-56" />
      ) : (
        <pre
          tabIndex={0}
          aria-label="Markdown 预览"
          className="hc-scrollbar max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500 dark:bg-neutral-950"
        >
          {preview.slice(0, previewLimit)}
        </pre>
      )}
      {preview.length > previewLimit && (
        <p className="mt-2 text-[11px] text-neutral-400">预览显示部分内容，下载包含全部记录。</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </EditorDialog>
  )
}
