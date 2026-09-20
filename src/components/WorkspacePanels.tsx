import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import { SourceEditorDialog } from '../editor/SourceEditorDialog'
import { DateEditorDialog } from '../editor/DateEditorDialog'
import { FindReplaceDialog } from '../editor/FindReplaceDialog'
import { TagManagerDialog } from '../editor/TagManagerDialog'
import { BatchEditDialog, SelectionBar } from '../editor/BatchEditDialog'
import {
  EditorDialog,
  fieldClass,
  primaryButtonClass,
  mutedButtonClass,
} from '../editor/EditorDialog'
import { useAppStore, savedViewsOf } from '../model/store'
import { parseChatlog } from '../parser/chatlog'
import { lintChatDoc } from '../parser/lint'
import { matchesFilters } from '../model/filters'
import { applyBatchEdit, messageAt } from '../model/mutations'
import { downloadText } from '../data/fileAccess'
import { listWorkspaces, type WorkspaceSnapshot } from '../data/workspace'
import { HistoryDialog } from './HistoryControls'
import { ChangeReview, SaveReviewDialog } from './ChangeReview'
import { ArchiveDialog } from './ArchiveDialog'
import { FilterDialog } from './ReadingToolbar'

const JournalEditor = lazy(() =>
  import('../editor/JournalEditor').then((module) => ({ default: module.JournalEditor })),
)

export function WorkspacePanels() {
  const state = useAppStore()
  const [batchOpen, setBatchOpen] = useState(false)
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const section of state.doc?.sessions ?? [])
      for (const item of [section, ...section.messages])
        for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    const colors = state.doc?.meta.tag_colors as Record<string, string> | undefined
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, color: colors?.[name] }))
  }, [state.doc])
  if (!state.doc) return null
  const close = () => state.setPanel(null)
  const selectableIds = state.doc.messages
    .filter(
      (message) =>
        matchesFilters(message, state.filters) &&
        (state.filter === 'all' || state.filter === message.role) &&
        (state.readMode !== 'diary' || message.role === 'user'),
    )
    .map((message) => message.id)
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => state.selected.has(id))
  const editorMessage = state.editor?.id
    ? (state.doc.messages.find((message) => message.id === state.editor!.id) ?? null)
    : null
  return (
    <>
      {state.editor && (
        <Suspense
          fallback={
            <EditorDialog title="打开编辑器…" onClose={() => state.setEditor(null)} fixedHeight>
              <div className="dg-diff-empty" role="status">
                正在准备这条记录
              </div>
            </EditorDialog>
          }
        >
          <JournalEditor
            key={`${state.sourceKey}:${state.editor.id ?? 'new'}:${state.editor.afterId ?? ''}`}
            message={editorMessage}
            date={state.editor.date}
            draftKey={`${state.sourceKey}:${state.editor.id ?? 'new'}:${state.editor.afterId ?? ''}`}
            initialTab={
              state.editor.tab as
                'body' | 'details' | 'parts' | 'annotations' | 'attachments' | 'source' | undefined
            }
            selectedQuote={state.editor.quote}
            availableTags={tags.map((tag) => tag.name)}
            onAddAttachments={state.addAttachments}
            onClose={() => state.setEditor(null)}
            onSave={(draft) => state.saveMessage(draft, state.editor!.id, state.editor!.afterId)}
            onDelete={editorMessage ? () => state.deleteMessages([editorMessage.id]) : undefined}
          />
        </Suspense>
      )}
      {state.dateEditor !== null && state.doc.sessions[state.dateEditor] && (
        <DateEditorDialog
          session={state.doc.sessions[state.dateEditor]!}
          onSave={(session) => state.patchSession(state.dateEditor!, session)}
          onClose={() => state.setDateEditor(null)}
        />
      )}
      {state.panel === 'source' && (
        <SourceEditorDialog
          source={state.text}
          draftKey={state.sourceKey}
          onClose={close}
          onSave={(text) => state.commitText(text, '编辑源文件')}
          validate={(text) => {
            const parsed = parseChatlog(text)
            return (
              [...parsed.issues, ...lintChatDoc(parsed)].find((issue) => issue.level === 'error')
                ?.message ?? null
            )
          }}
        />
      )}
      {state.panel === 'replace' && (
        <FindReplaceDialog
          messages={state.doc.messages}
          onClose={close}
          onApply={(patches) => {
            const changes = patches.map((patch) => ({
              ...patch,
              index: state.doc!.messages.find((message) => message.id === patch.id)!.index,
            }))
            state.mutate('查找替换', (doc) => {
              for (const change of changes) {
                const target = messageAt(doc, change.index).message
                const id = target.id || crypto.randomUUID()
                Object.assign(target, change.message, { id })
              }
            })
          }}
        />
      )}
      {state.panel === 'tags' && (
        <TagManagerDialog
          tags={tags}
          onClose={close}
          onRename={state.renameTag}
          onRemove={(tag) => state.renameTag(tag, '')}
          onColor={(tag, color) =>
            state.mutate('标签颜色', (doc) => {
              doc.meta.tag_colors = { ...((doc.meta.tag_colors as object) ?? {}), [tag]: color }
            })
          }
        />
      )}
      {state.panel === 'filters' && <FilterDialog onClose={close} />}
      {(state.panel === 'save-review' || state.panel === 'save-copy-review') && (
        <SaveReviewDialog asNew={state.panel === 'save-copy-review'} onClose={close} />
      )}
      {state.panel === 'history' && <HistoryDialog onClose={close} />}
      {state.panel === 'documents' && <DocumentsDialog onClose={close} />}
      {state.panel === 'document' && <DocumentSettingsDialog onClose={close} />}
      {(state.panel === 'export' || state.panel === 'archive') && (
        <ArchiveDialog initialFormat={state.panel === 'archive' ? 'zip' : 'v2'} onClose={close} />
      )}
      {state.selecting && (
        <SelectionBar
          count={state.selected.size}
          onEdit={() => setBatchOpen(true)}
          onClear={() => state.setSelecting(false)}
          onStar={() => state.patchMessages([...state.selected], { starred: true }, '批量收藏')}
          allSelected={allSelected}
          onSelectAll={() => state.setSelected(allSelected ? [] : selectableIds)}
        />
      )}
      {batchOpen && (
        <BatchEditDialog
          count={state.selected.size}
          availableTags={tags.map((tag) => tag.name)}
          onClose={() => setBatchOpen(false)}
          onDelete={() => state.deleteMessages([...state.selected])}
          onApply={(patch) => {
            const indices = state
              .doc!.messages.filter((message) => state.selected.has(message.id))
              .map((message) => message.index)
            state.mutate('批量整理', (doc) => applyBatchEdit(doc, indices, patch))
            state.setSelecting(false)
          }}
        />
      )}
      {state.fileStatus === 'conflict' && state.externalText !== null && <ConflictDialog />}
    </>
  )
}

function DocumentsDialog({ onClose }: { onClose: () => void }) {
  const state = useAppStore()
  const [documents, setDocuments] = useState<WorkspaceSnapshot[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void listWorkspaces()
      .then(setDocuments)
      .catch(() => setError('未能读取最近的日记，请直接打开本地文件。'))
  }, [])
  return (
    <EditorDialog
      title="最近打开的日记"
      subtitle="继续上次的记录，浏览器中的草稿也保留在这里。"
      onClose={onClose}
    >
      <div className="space-y-2">
        {documents.map((document) => (
          <button
            key={document.key}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-50 p-4 text-left hover:bg-[var(--dg-accent-soft)] dark:bg-neutral-800/40 dark:hover:bg-[var(--dg-accent-soft)]"
            onClick={() => void state.openWorkspace(document.key)}
          >
            <History
              size={18}
              className="shrink-0 text-[var(--dg-accent)] dark:text-[var(--dg-accent)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{document.name}</span>
              <span className="mt-1 block text-[11px] text-neutral-400">
                {new Date(document.updatedAt).toLocaleString()} ·{' '}
                {document.text !== document.baseline ? '有待保存的草稿' : '已保存的内容'}
              </span>
            </span>
            {document.key === state.sourceKey && (
              <span className="text-xs text-[var(--dg-accent)] dark:text-[var(--dg-accent)]">
                当前
              </span>
            )}
          </button>
        ))}
      </div>
      {documents.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-neutral-400">
          日记打开并保存草稿后，会出现在这里。
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </EditorDialog>
  )
}

function DocumentSettingsDialog({ onClose }: { onClose: () => void }) {
  const state = useAppStore()
  const [title, setTitle] = useState(state.doc!.title)
  const [timezone, setTimezone] = useState(state.doc!.timezone ?? '')
  const [error, setError] = useState('')
  return (
    <EditorDialog
      title="日记设置"
      onClose={onClose}
      footer={
        <button
          className={primaryButtonClass}
          disabled={!title.trim()}
          onClick={() => {
            if (timezone.trim())
              try {
                new Intl.DateTimeFormat('zh-CN', { timeZone: timezone.trim() })
              } catch {
                setError('请输入有效的时区，例如 Asia/Shanghai。')
                return
              }
            state.mutate('日记设置', (doc) => {
              doc.meta.title = title.trim()
              if (timezone.trim()) doc.meta.timezone = timezone.trim()
              else delete doc.meta.timezone
            })
            onClose()
          }}
        >
          保存设置
        </button>
      }
    >
      <div className="space-y-5">
        <label className="block text-xs text-neutral-500">
          日记名称
          <input
            className={`${fieldClass} mt-2`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block text-xs text-neutral-500">
          记录时区
          <input
            className={`${fieldClass} mt-2`}
            value={timezone}
            placeholder="Asia/Shanghai"
            onChange={(event) => setTimezone(event.target.value)}
          />
        </label>
        <p className="text-xs leading-5 text-neutral-400">
          时区用于说明记录中的本地时间，修改后不会改变原始时间戳。
        </p>
      </div>
      {savedViewsOf(state.doc).length > 0 && (
        <div className="mt-7">
          <h3 className="mb-2 text-xs font-medium text-neutral-500">常用筛选</h3>
          {savedViewsOf(state.doc).map((view) => (
            <div key={view.id} className="flex items-center justify-between py-2 text-xs">
              <button
                onClick={() => {
                  state.applyView(view)
                  onClose()
                }}
              >
                {view.name}
              </button>
              <button
                className="dg-icon"
                aria-label={`删除筛选 ${view.name}`}
                onClick={() => state.removeView(view.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </EditorDialog>
  )
}

function ConflictDialog() {
  const state = useAppStore()
  return (
    <EditorDialog
      wide
      title="文件有了新的修改"
      subtitle="磁盘文件与打开时不同，当前草稿已保留。"
      onClose={() => useAppStore.setState({ fileStatus: 'idle' })}
      footer={
        <>
          <button
            className={`${mutedButtonClass} mr-auto`}
            onClick={() => downloadText('未合并的草稿.chat.md', state.text)}
          >
            下载当前草稿
          </button>
          <button
            className={mutedButtonClass}
            onClick={() => {
              const text = state.externalText!
              state.commitText(text, '载入外部修改')
              useAppStore.setState({ baseline: text, externalText: null, fileStatus: 'idle' })
              void useAppStore.getState().saveDraft()
            }}
          >
            载入磁盘版本
          </button>
          <button
            className={primaryButtonClass}
            onClick={() => {
              useAppStore.setState({ fileStatus: 'idle' })
              state.setPanel('save-copy-review')
            }}
          >
            草稿另存为
          </button>
        </>
      }
    >
      <div className="h-[55dvh] min-h-0">
        <ChangeReview
          before={state.externalText!}
          after={state.text}
          beforeLabel="磁盘文件"
          afterLabel="当前草稿"
        />
      </div>
    </EditorDialog>
  )
}
