import { create } from 'zustand'
import { loadFromServer, serverAssetResolver } from '../data/fetchSource'
import {
  canRead,
  chooseFile,
  chooseSaveFile,
  downloadText,
  writeAsset,
  writeFile,
} from '../data/fileAccess'
import { loadLastDoc } from '../data/persistence'
import {
  createRevision,
  persistWorkspace,
  restoreWorkspace,
  workspaceFor,
  type Revision,
  type WorkspaceSnapshot,
} from '../data/workspace'
import {
  assetsFromDirectory,
  createFileAssetResolver,
  nullAssetResolver,
  pickDirectoryModern,
  sourceFromFiles,
  supportsDirectoryPicker,
  type PickedFile,
} from '../data/pickSource'
import { showToast } from '../lib/toast'
import { localReferences } from '../export/archive'
import { migrateV1ToV2, parseChatlog, serializeChatlog } from '../parser/chatlog'
import { lintChatDoc } from '../parser/lint'
import type { Attachment, ChatDoc, Message, Session } from '../parser/types'
import { deriveDoc, type DerivedDoc } from './derive'
import { EMPTY_FILTERS, matchesFilters, type JournalFilters, type SavedView } from './filters'
import { applyMessageEdit, ensureDay, messageAt, type MessageEdit } from './mutations'
import {
  applyHistoryEntry,
  createHistoryEntry,
  historyTexts,
  type HistoryEntry,
  type HistoryTexts,
} from './history'

export type RoleFilter = 'all' | 'user' | 'ai'
export type AppView = 'chat' | 'stats' | 'review'
export type AssetResolver = (path: string | null) => string | null
export type SourceKind = 'server' | 'files' | 'restored'
export type LoadState =
  | { phase: 'loading' }
  | { phase: 'empty'; reason: 'file-protocol' | 'not-found' | 'network' | null }
  | { phase: 'ready' }
export type Panel =
  | 'source'
  | 'history'
  | 'tags'
  | 'replace'
  | 'export'
  | 'archive'
  | 'filters'
  | 'documents'
  | 'document'
  | 'save-review'
  | 'save-copy-review'
  | null
export interface EditorTarget {
  id?: string
  /** 新记录写入的日期；编辑已有记录时总是使用它所在的日期节。 */
  date?: string
  afterId?: string
  quote?: string
  tab?: string
}

interface AppState {
  doc: DerivedDoc | null
  rawDoc: ChatDoc | null
  text: string
  baseline: string
  sourceKey: string
  sourceName: string | null
  sourceKind: SourceKind
  serverFiles: string[]
  load: LoadState
  fileHandle?: FileSystemFileHandle
  directoryHandle?: FileSystemDirectoryHandle
  assets: Map<string, File>
  pendingAssets: Set<string>
  reconnectedAssetPaths: Set<string>
  resolveAsset: AssetResolver
  draftStatus: 'saved' | 'saving' | 'error'
  fileStatus: 'idle' | 'saving' | 'saved' | 'downloaded' | 'conflict' | 'error'
  externalText: string | null
  revisions: Revision[]
  past: HistoryEntry[]
  future: HistoryEntry[]
  filter: RoleFilter
  filters: JournalFilters
  readMode: 'conversation' | 'diary'
  view: AppView
  editor: EditorTarget | null
  dateEditor: number | null
  panel: Panel
  selected: Set<string>
  selecting: boolean
  expandAllThinking: boolean
  jumpTarget: string | null
  jumpSmooth: boolean
  forcedIds: ReadonlySet<string>
  activeSession: number
  flashId: string | null
  searchOpen: boolean
  exportOpen: boolean
  settingsOpen: boolean
  lightbox: { attachments: Attachment[]; index: number } | null
  bootstrap: () => Promise<void>
  loadText: (name: string, text: string, resolver?: AssetResolver) => void
  openFiles: (files: PickedFile[]) => Promise<boolean>
  openDirectory: () => Promise<boolean>
  openFile: () => Promise<boolean>
  newDocument: () => Promise<void>
  openWorkspace: (key: string) => Promise<void>
  reconnectImages: () => Promise<void>
  saveFile: (asNew?: boolean) => Promise<void>
  saveDraft: () => Promise<boolean>
  /** 核对磁盘上的日记与附件；request 为 true 时来自用户点击，可请求读取授权并报告结果。 */
  syncWithDisk: (request?: boolean) => Promise<void>
  addAttachments: (files: File[]) => Promise<Attachment[]>
  commitText: (text: string, label: string, messageIds?: string[]) => void
  getHistoryTexts: (id: string) => HistoryTexts | null
  mutate: (label: string, change: (doc: ChatDoc) => void) => void
  saveMessage: (draft: MessageEdit, id?: string, afterId?: string) => Promise<void>
  patchMessages: (
    ids: string[],
    patch: Partial<Message> | ((message: Message) => void),
    label?: string,
  ) => void
  deleteMessages: (ids: string[]) => void
  duplicateMessage: (id: string) => void
  reorderMessage: (id: string, direction: -1 | 1) => void
  moveMessages: (ids: string[], date: string) => void
  patchSession: (index: number, patch: Partial<Session>) => void
  undo: () => void
  redo: () => void
  restoreRevision: (id: string) => void
  saveView: (name: string) => void
  applyView: (saved: SavedView) => void
  removeView: (id: string) => void
  renameTag: (from: string, to: string) => void
  setEditor: (editor: EditorTarget | null) => void
  setDateEditor: (index: number | null) => void
  setPanel: (panel: Panel) => void
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  setSelecting: (value: boolean) => void
  setFilters: (patch: Partial<JournalFilters>) => void
  clearFilters: () => void
  setReadMode: (mode: 'conversation' | 'diary') => void
  setFilter: (filter: RoleFilter) => void
  setView: (view: AppView) => void
  setExpandAllThinking: (value: boolean) => void
  requestJump: (id: string, options?: { flash?: boolean; smooth?: boolean }) => void
  clearJump: () => void
  setActiveSession: (index: number) => void
  setSearchOpen: (value: boolean) => void
  setExportOpen: (value: boolean) => void
  setSettingsOpen: (value: boolean) => void
  clearFlash: () => void
  openLightbox: (attachments: Attachment[], index: number) => void
  closeLightbox: () => void
  stepLightbox: (delta: number) => void
}

const READING_ID = Symbol('readingId')
type EditableMessage = Message & { [READING_ID]?: string }
let draftSequence = 0
let fileSaveSequence = 0
let diskCheck: Promise<void> | null = null

/** 本地附件优先；随应用部署的网页数据再回退到服务器上的附件。 */
function resolverFor(assets: Map<string, File>, sourceKind: SourceKind): AssetResolver {
  const local = createFileAssetResolver(assets)
  return sourceKind === 'server' ? (path) => local(path) ?? serverAssetResolver(path) : local
}

/** 路径、大小与修改时间都一致时沿用现有附件，避免重建对象 URL 让图片闪烁。 */
function sameAssets(left: Map<string, File>, right: Map<string, File>): boolean {
  if (left.size !== right.size) return false
  for (const [path, file] of left) {
    const other = right.get(path)
    if (!other || other.size !== file.size || other.lastModified !== file.lastModified) return false
  }
  return true
}

function messageFingerprint(message: Message): string {
  const { id: _id, line: _line, _source: _source, ...content } = message
  return JSON.stringify(
    Object.entries(content).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function parsedState(text: string, ids?: string[], previous?: AppState) {
  const rawDoc = parseChatlog(text)
  const doc = deriveDoc(rawDoc, [...rawDoc.issues, ...lintChatDoc(rawDoc)])
  if (!ids && previous?.rawDoc && previous.doc) {
    // 整文编辑先对齐原文件 ID，再对齐未改内容；插入/删除不能让后续记录换锚点。
    const oldMessages = previous.rawDoc.sessions.flatMap((section) => section.messages)
    const oldIds = previous.doc.messages.map((message) => message.id)
    const used = new Set<number>()
    const byRawId = new Map<string, number[]>()
    const byFingerprint = new Map<string, number[]>()
    oldMessages.forEach((message, index) => {
      if (message.id) byRawId.set(message.id, [...(byRawId.get(message.id) ?? []), index])
      const key = messageFingerprint(message)
      byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), index])
    })
    const findUnused = (indices: number[] | undefined) =>
      indices?.find((index) => !used.has(index)) ?? -1
    const messages = rawDoc.sessions.flatMap((section) => section.messages)
    const matches = messages.map((message) => {
      let found = message.id ? findUnused(byRawId.get(message.id)) : -1
      if (found < 0) found = findUnused(byFingerprint.get(messageFingerprint(message)))
      if (found >= 0) used.add(found)
      return found
    })
    ids = matches.map((found, index) => {
      if (found >= 0) return oldIds[found]!
      if (messages.length === oldMessages.length && !used.has(index)) {
        used.add(index)
        return oldIds[index]!
      }
      return crypto.randomUUID()
    })
  }
  if (ids)
    doc.messages.forEach((message, index) => {
      message.id = ids[index]!
    })
  return { text, rawDoc, doc }
}

export function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function snapshot(state: AppState): WorkspaceSnapshot {
  return {
    key: state.sourceKey,
    name: state.sourceName!,
    text: state.text,
    baseline: state.baseline,
    sourceKind: state.sourceKind,
    assets: [...state.assets],
    fileHandle: state.fileHandle,
    directoryHandle: state.directoryHandle,
    pendingAssets: [...state.pendingAssets],
    reconnectedAssetPaths: [...state.reconnectedAssetPaths],
    revisions: state.revisions,
    past: state.past,
    future: state.future,
    messageIds: state.doc!.messages.map((message) => message.id),
    updatedAt: Date.now(),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试'
}

export function savedViewsOf(doc: DerivedDoc | null): SavedView[] {
  const views = doc?.meta.saved_views
  return Array.isArray(views)
    ? views.filter(
        (item): item is SavedView =>
          !!item && typeof item === 'object' && typeof item.name === 'string' && !!item.filters,
      )
    : []
}

export const useAppStore = create<AppState>((set, get) => ({
  doc: null,
  rawDoc: null,
  text: '',
  baseline: '',
  sourceKey: '',
  sourceName: null,
  sourceKind: 'server',
  serverFiles: [],
  load: { phase: 'loading' },
  assets: new Map(),
  pendingAssets: new Set(),
  reconnectedAssetPaths: new Set(),
  resolveAsset: serverAssetResolver,
  draftStatus: 'saved',
  fileStatus: 'idle',
  externalText: null,
  revisions: [],
  past: [],
  future: [],
  filter: 'all',
  filters: { ...EMPTY_FILTERS },
  readMode: 'conversation',
  view: 'chat',
  editor: null,
  dateEditor: null,
  panel: null,
  selected: new Set(),
  selecting: false,
  expandAllThinking: false,
  jumpTarget: null,
  jumpSmooth: false,
  forcedIds: new Set(),
  activeSession: 0,
  flashId: null,
  searchOpen: false,
  exportOpen: false,
  settingsOpen: false,
  lightbox: null,

  bootstrap: async () => {
    if (new URLSearchParams(location.search).has('demo')) {
      const demo = await import('../../examples/示例日记-v2.chat.md?raw')
      const restored = new URLSearchParams(location.search).has('reset')
        ? null
        : await workspaceFor('demo')
      get().loadText('示例日记.chat.md', restored?.text ?? demo.default, nullAssetResolver)
      const assets = new Map(restored?.assets ?? [])
      set({
        ...parsedState(restored?.text ?? demo.default, restored?.messageIds),
        sourceKey: 'demo',
        baseline: restored?.baseline ?? demo.default,
        revisions: restored?.revisions ?? get().revisions,
        past: restored?.past ?? [],
        future: restored?.future ?? [],
        assets,
        pendingAssets: new Set(restored?.pendingAssets ?? []),
        reconnectedAssetPaths: new Set(restored?.reconnectedAssetPaths ?? []),
        resolveAsset: createFileAssetResolver(assets),
      })
      return
    }
    try {
      const restored = await restoreWorkspace()
      if (restored) {
        get().loadText(
          restored.name,
          restored.text,
          restored.sourceKind === 'server' ? serverAssetResolver : nullAssetResolver,
        )
        const assets = new Map(restored.assets)
        set({
          ...parsedState(restored.text, restored.messageIds),
          sourceKey: restored.key,
          sourceKind: restored.sourceKind,
          baseline: restored.baseline,
          fileHandle: restored.fileHandle,
          directoryHandle: restored.directoryHandle,
          assets,
          revisions: restored.revisions,
          past: restored.past ?? [],
          future: restored.future ?? [],
          pendingAssets: new Set(restored.pendingAssets ?? []),
          reconnectedAssetPaths: new Set(restored.reconnectedAssetPaths ?? []),
          resolveAsset: resolverFor(assets, restored.sourceKind),
        })
        // 关闭页面期间文件可能被其他编辑器修改；仍有读取授权时立即核对。
        await get().syncWithDisk()
        return
      }
    } catch {
      showToast('无法恢复浏览器草稿，请打开已保存的文件')
    }
    const result = await loadFromServer()
    if (result.chat) {
      get().loadText(result.chat.name, result.chat.text, serverAssetResolver)
      set({
        sourceKind: 'server',
        sourceKey: `server:${result.chat.name}`,
        serverFiles: result.files,
      })
      return
    }
    const legacy = await loadLastDoc()
    if (legacy) {
      get().loadText(legacy.name, legacy.text, nullAssetResolver)
      return
    }
    set({ load: { phase: 'empty', reason: result.failure } })
  },

  loadText: (name, text, resolveAsset = nullAssetResolver) => {
    set({
      ...parsedState(text),
      baseline: text,
      sourceName: name,
      sourceKey: crypto.randomUUID(),
      resolveAsset,
      load: { phase: 'ready' },
      view: 'chat',
      sourceKind: 'files',
      fileHandle: undefined,
      directoryHandle: undefined,
      assets: new Map(),
      pendingAssets: new Set(),
      reconnectedAssetPaths: new Set(),
      editor: null,
      dateEditor: null,
      panel: null,
      revisions: [createRevision(text, '打开文件')],
      past: [],
      future: [],
      draftStatus: 'saved',
      readMode: 'conversation',
      selected: new Set(),
      selecting: false,
      filters: { ...EMPTY_FILTERS },
      filter: 'all',
      jumpTarget: null,
      forcedIds: new Set(),
      lightbox: null,
      externalText: null,
      fileStatus: 'idle',
    })
  },

  openFiles: async (files) => {
    if (get().fileStatus === 'saving') {
      showToast('正在写入文件，请稍后切换日记')
      return false
    }
    if (get().doc && !(await get().saveDraft())) return false
    const source = await sourceFromFiles(files)
    if (!source) {
      showToast('没有找到 Markdown 文件')
      return false
    }
    get().loadText(source.name, source.text, createFileAssetResolver(source.assets))
    set({ assets: source.assets, fileHandle: source.handle, sourceKind: 'files' })
    await get().saveDraft()
    return true
  },
  openFile: async () => {
    if (get().fileStatus === 'saving') {
      showToast('正在写入文件，请稍后切换日记')
      return true
    }
    try {
      const handle = await chooseFile()
      if (handle === undefined) return false
      if (handle)
        await get().openFiles([{ relPath: handle.name, file: await handle.getFile(), handle }])
    } catch (error) {
      showToast(errorText(error))
    }
    return true
  },
  openDirectory: async () => {
    if (get().fileStatus === 'saving') {
      showToast('正在写入文件，请稍后切换日记')
      return true
    }
    if (!supportsDirectoryPicker()) return false
    try {
      const picked = await pickDirectoryModern()
      if (picked && (await get().openFiles(picked.files))) {
        set({ directoryHandle: picked.handle })
        await get().saveDraft()
      }
    } catch (error) {
      showToast(errorText(error))
    }
    return true
  },
  openWorkspace: async (key) => {
    if (get().fileStatus === 'saving') {
      showToast('正在写入文件，请稍后切换日记')
      return
    }
    if (get().doc && !(await get().saveDraft())) return
    const restored = await workspaceFor(key)
    if (!restored) return
    get().loadText(restored.name, restored.text)
    const assets = new Map(restored.assets)
    set({
      ...parsedState(restored.text, restored.messageIds),
      sourceKey: key,
      sourceKind: restored.sourceKind,
      baseline: restored.baseline,
      revisions: restored.revisions,
      past: restored.past ?? [],
      future: restored.future ?? [],
      assets,
      pendingAssets: new Set(restored.pendingAssets ?? []),
      reconnectedAssetPaths: new Set(restored.reconnectedAssetPaths ?? []),
      fileHandle: restored.fileHandle,
      directoryHandle: restored.directoryHandle,
      resolveAsset: resolverFor(assets, restored.sourceKind),
    })
    await get().saveDraft()
    await get().syncWithDisk()
  },
  newDocument: async () => {
    if (get().fileStatus === 'saving') {
      showToast('正在写入文件，请稍后切换日记')
      return
    }
    if (get().doc && !(await get().saveDraft())) return
    const text = `---\nformat: chatlog-md/2\ntitle: 我的对话日记\ntimezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n---\n\n# @${todayString()}\n`
    get().loadText('我的对话日记.chat.md', text)
    set({ baseline: '', editor: { date: todayString() } })
    void get().saveDraft()
  },
  reconnectImages: async () => {
    if (!supportsDirectoryPicker()) {
      showToast('请通过顶部菜单打开含附件的文件夹；当前草稿已保留')
      return
    }
    let picked
    try {
      picked = await pickDirectoryModern()
    } catch (error) {
      showToast(errorText(error))
      return
    }
    if (!picked) return
    const initial = get()
    const source = await sourceFromFiles(picked.files, initial.sourceName ?? undefined)
    const fromDiaryDirectory =
      !!initial.directoryHandle && !!initial.fileHandle && !!source?.handle &&
      (await source.handle.isSameEntry(initial.fileHandle))
    if (get().sourceKey !== initial.sourceKey) return
    const assets = new Map(get().assets)
    const reconnectedAssetPaths = new Set(get().reconnectedAssetPaths)
    for (const [path, file] of source?.assets ??
      picked.files.map((file) => [file.relPath, file.file] as const)) {
      assets.set(path, file)
      // 重新选回日记所在目录时恢复自动刷新；其他目录的附件保留用户明确选择的文件。
      if (fromDiaryDirectory) reconnectedAssetPaths.delete(path)
      else reconnectedAssetPaths.add(path)
    }
    // 重新关联仅补充资源，不切换文档，也不改变当前文件的写入目录。
    set({ assets, reconnectedAssetPaths, resolveAsset: resolverFor(assets, get().sourceKind) })
    await get().saveDraft()
    showToast('已重新关联附件')
  },

  saveDraft: async () => {
    if (!get().doc) return true
    const sequence = ++draftSequence
    const current = snapshot(get())
    set({ draftStatus: 'saving' })
    try {
      await persistWorkspace(current)
      if (sequence === draftSequence && get().sourceKey === current.key)
        set({ draftStatus: 'saved' })
      return true
    } catch {
      if (sequence === draftSequence && get().sourceKey === current.key) {
        set({ draftStatus: 'error' })
        showToast('浏览器未能保存草稿，请立即保存或下载文件')
      }
      return false
    }
  },
  saveFile: async (asNew = false) => {
    const initial = get()
    const stillCurrent = () => get().sourceKey === initial.sourceKey
    if (!initial.doc || initial.fileStatus === 'saving') return
    if (initial.doc.issues.some((issue) => issue.level === 'error')) {
      showToast('请先处理格式检查中的错误，再保存文件')
      return
    }
    try {
      const references = new Set(localReferences(initial.rawDoc!))
      const pendingAssets = new Set(
        [...initial.pendingAssets].filter((path) => references.has(path)),
      )
      if (
        (pendingAssets.size && !initial.directoryHandle) ||
        (references.size && (asNew || !initial.fileHandle))
      ) {
        set({ panel: 'archive' })
        showToast('请将日记与附件一起保存为归档包；写回原文件可先打开所在文件夹')
        return
      }
      fileSaveSequence++
      set({ fileStatus: 'saving' })
      let handle = asNew ? undefined : initial.fileHandle
      if (!handle) {
        const picked = await chooseSaveFile(initial.sourceName ?? '日记.chat.md')
        if (!stillCurrent()) return
        if (picked === null) {
          set({ fileStatus: 'idle' })
          return
        }
        if (picked === undefined) {
          downloadText(initial.sourceName ?? '日记.chat.md', initial.text)
          set({ fileStatus: get().text === initial.text ? 'downloaded' : 'idle' })
          showToast('已下载日记副本')
          return
        }
        handle = picked
        if (initial.fileHandle && (await handle.isSameEntry(initial.fileHandle))) asNew = false
      }
      if (!stillCurrent()) return
      if (!asNew && initial.fileHandle) {
        const external = await (await handle.getFile()).text()
        if (!stillCurrent()) return
        if (external !== initial.baseline) {
          set({ fileStatus: 'conflict', externalText: external })
          return
        }
      }
      set({ fileStatus: 'saving' })
      const directoryHandle = asNew ? undefined : initial.directoryHandle
      if (directoryHandle) {
        const backups = await directoryHandle.getDirectoryHandle('.dialogary-backups', {
          create: true,
        })
        const backup = await backups.getFileHandle(`${Date.now()}-${initial.sourceName}.bak`, {
          create: true,
        })
        await writeFile(backup, initial.baseline)
        for (const path of pendingAssets)
          await writeAsset(directoryHandle, path, initial.assets.get(path)!)
      }
      await writeFile(handle, initial.text)
      const verified = await (await handle.getFile()).text()
      if (!stillCurrent()) return
      if (verified !== initial.text) throw new Error('保存后的文件校验未通过，草稿仍已保留')
      set({
        fileHandle: handle,
        directoryHandle,
        // 连接到本地文件后，刷新应恢复该文件的草稿，不能再用网页副本替换它。
        sourceKind: 'files',
        sourceName: handle.name,
        baseline: initial.text,
        fileStatus: get().text === initial.text ? 'saved' : 'idle',
        pendingAssets: new Set([...get().pendingAssets].filter((path) => !pendingAssets.has(path))),
        revisions: [createRevision(initial.text, '保存到文件'), ...get().revisions].slice(0, 30),
        externalText: null,
      })
      await get().saveDraft()
      showToast('已保存到文件')
    } catch (error) {
      if (stillCurrent()) {
        set({ fileStatus: 'error' })
        showToast(`保存未完成：${errorText(error)}`)
      }
    }
  },

  syncWithDisk: (request = false) => {
    // 窗口频繁获得焦点时合并为一次核对；主动载入排在进行中的核对之后，仍会报告结果。
    if (diskCheck) return request ? diskCheck.then(() => get().syncWithDisk(true)) : diskCheck
    diskCheck = (async () => {
      const initial = get()
      if (!initial.doc || initial.fileStatus === 'saving') return
      const saveSequence = fileSaveSequence
      // 保存可能在目录扫描期间完整结束；此前读到的文件与附件快照都不能再应用。
      const stillCurrent = () =>
        get().sourceKey === initial.sourceKey &&
        get().baseline === initial.baseline &&
        fileSaveSequence === saveSequence &&
        get().fileStatus !== 'saving'
      // 先确认文件夹授权：它同时覆盖其中的日记文件，避免连续弹出两次授权。
      const directoryReadable =
        !!initial.directoryHandle && (await canRead(initial.directoryHandle, request))
      let external: string | null = null
      if (initial.fileHandle) {
        if (!(await canRead(initial.fileHandle, request))) {
          if (request) showToast('需要允许读取文件，才能载入最新内容')
          return
        }
        try {
          external = await (await initial.fileHandle.getFile()).text()
        } catch (error) {
          // 文件被移动或删除时不改动草稿，只在用户主动载入时说明原因。
          if (request) showToast(`未能读取文件：${errorText(error)}`)
          return
        }
      } else if (initial.sourceKind === 'server' && initial.sourceName) {
        const fresh = await loadFromServer(initial.sourceName)
        set({ serverFiles: fresh.files })
        if (fresh.chat?.name === initial.sourceName) external = fresh.chat.text
      }
      if (external === null || !stillCurrent()) return

      // 附件文件被替换后，旧的 File 对象无法再读取；目录内容有变化时整体换用新文件。
      let assetsChanged = false
      if (directoryReadable) {
        const scanned = await assetsFromDirectory(
          initial.directoryHandle!,
          initial.sourceName!,
        ).catch(() => null)
        const current = get()
        if (scanned && stillCurrent()) {
          // 只刷新日记目录拥有的附件；待写入、另行关联和目录之外的资源仍使用已载入的文件。
          for (const [path, file] of current.assets)
            if (
              current.pendingAssets.has(path) ||
              current.reconnectedAssetPaths.has(path) ||
              path.startsWith('../')
            ) scanned.set(path, file)
          if (!sameAssets(current.assets, scanned)) {
            set({ assets: scanned, resolveAsset: resolverFor(scanned, current.sourceKind) })
            assetsChanged = true
          }
        }
      }
      if (!stillCurrent()) return

      const state = get()
      // 编辑器中的草稿尚未进入 state.text，保持原基线，后续保存仍能发现外部冲突。
      const editing = state.editor !== null || state.dateEditor !== null ||
        state.panel === 'source' || state.panel === 'document'
      // 已提示过的同一份外部内容只在主动载入时再次对照。
      const textChanged =
        external !== state.baseline &&
        (request || external !== state.externalText) &&
        !editing
      if (textChanged) {
        if (external === state.text)
          set({
            baseline: external,
            externalText: null,
            fileStatus: state.fileStatus === 'conflict' ? 'idle' : state.fileStatus,
          })
        else if (state.text === state.baseline) {
          state.commitText(external, '载入外部修改')
          set({ baseline: external, externalText: null })
          showToast('已载入文件的最新内容')
        } else set({ fileStatus: 'conflict', externalText: external })
      } else if (assetsChanged) showToast('附件已更新')
      else if (request) showToast(editing ? '完成编辑后，可重新载入文件' : '文件没有新的修改')
      if (textChanged || assetsChanged) await get().saveDraft()
    })().finally(() => {
      diskCheck = null
    })
    return diskCheck
  },

  addAttachments: async (files) => {
    const assets = new Map(get().assets)
    const pendingAssets = new Set(get().pendingAssets)
    const added: Attachment[] = []
    for (const file of files) {
      const safeName = file.name.replace(/[\\/:*?"<>|]/g, '_')
      const path = `assets/${crypto.randomUUID().slice(0, 8)}-${safeName}`
      assets.set(path, file)
      pendingAssets.add(path)
      added.push({
        kind: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        path,
        meta: {},
      })
    }
    set({ assets, pendingAssets, resolveAsset: resolverFor(assets, get().sourceKind) })
    await get().saveDraft()
    return added
  },

  commitText: (text, label, messageIds) => {
    const current = get()
    if (text === current.text) return
    const parsed = parsedState(text, messageIds, current)
    const entry = createHistoryEntry(
      current.text,
      text,
      label,
      current.doc?.messages.map((message) => message.id) ?? [],
      parsed.doc.messages.map((message) => message.id),
    )
    const retainedIds = new Set(parsed.doc.messages.map((message) => message.id))
    set({
      ...parsed,
      past: [...current.past, entry],
      future: [],
      revisions: [createRevision(current.text, `修改前 · ${label}`), ...current.revisions].slice(
        0,
        30,
      ),
      fileStatus:
        current.fileStatus === 'conflict' || current.fileStatus === 'saving'
          ? current.fileStatus
          : 'idle',
      selected: new Set([...current.selected].filter((id) => retainedIds.has(id))),
    })
    void get().saveDraft()
  },
  getHistoryTexts: (id) => {
    const state = get()
    return historyTexts(state.text, state.past, state.future, id)
  },
  mutate: (label, change) => {
    const current = get()
    if (!current.rawDoc) return
    let editable: ChatDoc
    if (current.rawDoc.format === 'chatlog-md/1') {
      const migration = migrateV1ToV2(current.text)
      if (!migration.report.ok) {
        showToast('v1 转换检查未通过，请先查看格式提示')
        return
      }
      editable = parseChatlog(migration.text)
    } else editable = structuredClone(current.rawDoc)
    const unchanged = serializeChatlog(editable)
    const originalIds = current.doc!.messages.map((message) => message.id)
    const originalValues = new Map<string, { id?: string; fingerprint: string }>()
    editable.sessions
      .flatMap((section) => section.messages)
      .forEach((message, index) => {
        // Symbol 不进入 Markdown/JSON；替换消息的对象展开仍会携带阅读锚点。
        ;(message as EditableMessage)[READING_ID] = originalIds[index]!
        originalValues.set(originalIds[index]!, {
          id: message.id,
          fingerprint: messageFingerprint(message),
        })
      })
    change(editable)
    for (const message of editable.sessions.flatMap((section) => section.messages)) {
      const original = originalValues.get((message as EditableMessage)[READING_ID] ?? '')
      // 单纯打开并保存编辑器，不应因自动补 ID 生成一次虚假的修改。
      if (original && messageFingerprint(message) === original.fingerprint) {
        if (original.id === undefined) delete message.id
        else message.id = original.id
      }
    }
    const text = serializeChatlog(editable)
    if (text === unchanged) return
    const used = new Set<string>()
    const ids = editable.sessions
      .flatMap((section) => section.messages)
      .map((message) => {
        let id = (message as EditableMessage)[READING_ID] ?? message.id ?? crypto.randomUUID()
        if (used.has(id)) id = crypto.randomUUID()
        used.add(id)
        return id
      })
    get().commitText(text, label, ids)
  },
  saveMessage: async (draft, id, afterId) => {
    const sourceKey = get().sourceKey
    const index = id ? get().doc!.messages.find((message) => message.id === id)!.index : undefined
    const afterIndex = afterId
      ? get().doc!.messages.find((message) => message.id === afterId)!.index
      : undefined
    let target = ''
    get().mutate(id ? '编辑记录' : '添加记录', (doc) => {
      target = applyMessageEdit(doc, draft, index, afterIndex)
    })
    if (!target) throw new Error('记录尚未保存，请先处理格式提示')
    if (!(await get().saveDraft()))
      throw new Error('浏览器未能保存草稿，修改仍保留在编辑器中。请先下载文件。')
    if (get().sourceKey !== sourceKey) return
    set({ editor: null })
    if (!id) get().requestJump(target, { flash: true })
  },
  patchMessages: (ids, patch, label = '整理记录') => {
    const indices = get()
      .doc!.messages.filter((message) => ids.includes(message.id))
      .map((message) => message.index)
    get().mutate(label, (doc) => {
      for (const index of indices) {
        const { message } = messageAt(doc, index)
        if (typeof patch === 'function') patch(message)
        else Object.assign(message, patch)
        message.id ||= crypto.randomUUID()
      }
    })
  },
  deleteMessages: (ids) => {
    const indices = new Set(
      get()
        .doc!.messages.filter((message) => ids.includes(message.id))
        .map((message) => message.index),
    )
    get().mutate('删除记录', (doc) => {
      let index = 0
      for (const session of doc.sessions)
        session.messages = session.messages.filter(() => !indices.has(index++))
    })
    set({ editor: null, selecting: false })
    showToast('记录已删除，可撤销或从历史版本恢复')
  },
  duplicateMessage: (id) => {
    const selected = get().doc!.messages.find((message) => message.id === id)!
    let copiedId = ''
    get().mutate('复制记录', (doc) => {
      const { message, session, position } = messageAt(doc, selected.index)
      copiedId = crypto.randomUUID()
      session.messages.splice(position + 1, 0, { ...structuredClone(message), id: copiedId })
    })
    get().requestJump(copiedId, { flash: true })
  },
  reorderMessage: (id, direction) => {
    const selected = get().doc!.messages.find((message) => message.id === id)!
    get().mutate('调整记录顺序', (doc) => {
      const { session, position } = messageAt(doc, selected.index)
      const next = position + direction
      if (next < 0 || next >= session.messages.length) return
      ;[session.messages[position], session.messages[next]] = [
        session.messages[next]!,
        session.messages[position]!,
      ]
    })
  },
  moveMessages: (ids, date) => {
    const indices = new Set(
      get()
        .doc!.messages.filter((message) => ids.includes(message.id))
        .map((message) => message.index),
    )
    get().mutate('移动记录', (doc) => {
      const moved: Message[] = []
      let index = 0
      for (const section of doc.sessions)
        section.messages = section.messages.filter((message) => {
          if (!indices.has(index++)) return true
          moved.push({
            ...message,
            id: message.id || crypto.randomUUID(),
            time: message.time ? date + message.time.slice(10) : null,
          })
          return false
        })
      ensureDay(doc, date).messages.push(...moved)
    })
  },
  patchSession: (index, patch) =>
    get().mutate('编辑日期', (doc) => {
      const session = doc.sessions[index]!
      if (patch.date && session.date !== patch.date)
        for (const message of session.messages) {
          if (message.time?.slice(0, 10) === session.date)
            message.time = patch.date + message.time.slice(10)
        }
      // 日期编辑器接收派生视图；只回写日期自身字段，不能用旧消息覆盖已调整的时间。
      const {
        messages: _messages,
        _source: _source,
        line: _line,
        index: _index,
        weekday: _weekday,
        userCount: _userCount,
        aiCount: _aiCount,
        charCount: _charCount,
        ...fields
      } = patch as Partial<Session> & {
        index?: number
        weekday?: string | null
        userCount?: number
        aiCount?: number
        charCount?: number
      }
      Object.assign(session, fields)
    }),
  undo: () => {
    const state = get()
    const entry = state.past.at(-1)
    if (!entry) return
    const text = applyHistoryEntry(state.text, entry, 'undo')
    set({
      ...parsedState(text, entry.beforeIds),
      past: state.past.slice(0, -1),
      future: [entry, ...state.future],
      selected: new Set(),
      fileStatus:
        state.fileStatus === 'conflict' || state.fileStatus === 'saving'
          ? state.fileStatus
          : 'idle',
    })
    void get().saveDraft()
    showToast(`已撤销：${entry.label}`)
  },
  redo: () => {
    const state = get()
    const entry = state.future[0]
    if (!entry) return
    const text = applyHistoryEntry(state.text, entry, 'redo')
    set({
      ...parsedState(text, entry.afterIds),
      past: [...state.past, entry],
      future: state.future.slice(1),
      selected: new Set(),
      fileStatus:
        state.fileStatus === 'conflict' || state.fileStatus === 'saving'
          ? state.fileStatus
          : 'idle',
    })
    void get().saveDraft()
    showToast(`已重做：${entry.label}`)
  },
  restoreRevision: (id) => {
    const revision = get().revisions.find((item) => item.id === id)
    if (revision) get().commitText(revision.text, '恢复历史版本')
  },
  saveView: (name) => {
    const state = get()
    const view: SavedView = {
      id: crypto.randomUUID(),
      name,
      filters: state.filters,
      role: state.filter,
      readMode: state.readMode,
    }
    state.mutate('保存筛选', (doc) => {
      doc.meta.saved_views = [...savedViewsOf(state.doc), view]
    })
  },
  applyView: (saved) =>
    set({
      filters: { ...EMPTY_FILTERS, ...saved.filters },
      filter: saved.role,
      readMode: saved.readMode,
      view: 'chat',
      panel: null,
    }),
  removeView: (id) =>
    get().mutate('删除常用筛选', (doc) => {
      doc.meta.saved_views = savedViewsOf(get().doc).filter((view) => view.id !== id)
    }),
  renameTag: (from, to) => {
    get().mutate(to ? '重命名标签' : '移除标签', (doc) => {
      for (const session of doc.sessions)
        for (const item of [session, ...session.messages]) {
          if (item.tags?.includes(from))
            item.tags = [
              ...new Set(item.tags.flatMap((tag) => (tag === from ? (to ? [to] : []) : [tag]))),
            ]
        }
      const colors = doc.meta.tag_colors as Record<string, string> | undefined
      if (colors?.[from]) {
        if (to) colors[to] = colors[from]
        delete colors[from]
      }
      const views = doc.meta.saved_views as SavedView[] | undefined
      if (Array.isArray(views))
        for (const view of views) if (view.filters?.tag === from) view.filters.tag = to
    })
    if (get().filters.tag === from) get().setFilters({ tag: to })
  },
  setEditor: (editor) => set({ editor }),
  setDateEditor: (dateEditor) => set({ dateEditor }),
  setPanel: (panel) => set({ panel }),
  toggleSelected: (id) =>
    set((state) => {
      const selected = new Set(state.selected)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { selected }
    }),
  setSelected: (ids) => set({ selected: new Set(ids), selecting: true }),
  setSelecting: (selecting) => set({ selecting, selected: new Set() }),
  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch }, view: 'chat' })),
  clearFilters: () => set({ filters: { ...EMPTY_FILTERS }, filter: 'all' }),
  setReadMode: (readMode) => set({ readMode, filter: 'all' }),
  setFilter: (filter) => set({ filter }),
  setView: (view) => set({ view }),
  setExpandAllThinking: (expandAllThinking) => set({ expandAllThinking }),
  requestJump: (id, options) =>
    set((state) => {
      const target = state.doc?.messages.find((message) => message.id === id)
      const hidden =
        target &&
        (!matchesFilters(target, state.filters) ||
          (state.filter !== 'all' && target.role !== state.filter) ||
          (state.readMode === 'diary' && target.role !== 'user'))
      return {
        jumpTarget: id,
        jumpSmooth: !!options?.smooth,
        view: 'chat',
        ...(hidden
          ? {
              filters: { ...EMPTY_FILTERS },
              filter: 'all' as const,
              readMode: 'conversation' as const,
            }
          : {}),
        forcedIds: new Set(state.forcedIds).add(id),
        flashId: options?.flash ? id : state.flashId,
      }
    }),
  clearJump: () => set({ jumpTarget: null }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  clearFlash: () => set({ flashId: null }),
  openLightbox: (attachments, index) => set({ lightbox: { attachments, index } }),
  closeLightbox: () => set({ lightbox: null }),
  stepLightbox: (delta) =>
    set((state) =>
      state.lightbox
        ? {
            lightbox: {
              ...state.lightbox,
              index:
                (state.lightbox.index + delta + state.lightbox.attachments.length) %
                state.lightbox.attachments.length,
            },
          }
        : {},
    ),
}))
