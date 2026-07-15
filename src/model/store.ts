import { create } from 'zustand'
import { loadFromServer, serverAssetResolver } from '../data/fetchSource'
import { loadLastDoc, loadGrantedDirHandle, requestDirHandle, saveDirHandle, saveLastDoc } from '../data/persistence'
import {
  nullAssetResolver,
  pickDirectoryModern,
  sourceFromFiles,
  supportsDirectoryPicker,
  walkDirectoryHandle,
  type PickedFile,
} from '../data/pickSource'
import { showToast } from '../lib/toast'
import { parseChatlog } from '../parser/chatlog'
import { lintChatDoc } from '../parser/lint'
import type { Attachment } from '../parser/types'
import { deriveDoc, type DerivedDoc } from './derive'

export type RoleFilter = 'all' | 'user' | 'ai'
export type AppView = 'chat' | 'stats'

export type LoadState =
  | { phase: 'loading' }
  | { phase: 'empty'; reason: 'file-protocol' | 'not-found' | 'network' | null }
  | { phase: 'ready' }

export type AssetResolver = (path: string | null) => string | null

export type SourceKind = 'server' | 'files' | 'restored'

interface AppState {
  doc: DerivedDoc | null
  sourceName: string | null
  sourceKind: SourceKind
  /** manifest 中的候选文件（服务器模式下可切换） */
  serverFiles: string[]
  load: LoadState
  filter: RoleFilter
  view: AppView
  expandAllThinking: boolean
  resolveAsset: AssetResolver
  /** 跳转请求：ChatPane 消费后清空（配合 forcedIds 强制挂载 + 滚动定位） */
  jumpTarget: string | null
  /** 本次跳转是否平滑滚动（目录点击用） */
  jumpSmooth: boolean
  /** 被强制同步挂载的消息 id（跳转目标绕过懒挂载） */
  forcedIds: ReadonlySet<string>
  /** 当前滚动位置所在的日期节（大纲高亮用） */
  activeSession: number
  /** 搜索跳转后闪烁高亮的消息 id */
  flashId: string | null
  searchOpen: boolean
  exportOpen: boolean
  settingsOpen: boolean
  lightbox: { attachments: Attachment[]; index: number } | null

  bootstrap: () => Promise<void>
  /** 手动打开（文件选择器/拖拽产物）；找不到 .md 时返回 false */
  openFiles: (files: PickedFile[]) => Promise<boolean>
  /** Chromium FSA 目录选择（含句柄持久化）；不支持时返回 false 让调用方回退 input */
  openDirectory: () => Promise<boolean>
  /** 恢复的文档缺图片时，重新授权上次的文件夹 */
  reconnectImages: () => Promise<void>
  openLightbox: (attachments: Attachment[], index: number) => void
  closeLightbox: () => void
  stepLightbox: (delta: number) => void
  loadText: (name: string, text: string, resolveAsset?: AssetResolver) => void
  setFilter: (f: RoleFilter) => void
  setView: (v: AppView) => void
  setExpandAllThinking: (v: boolean) => void
  requestJump: (id: string, opts?: { flash?: boolean; smooth?: boolean }) => void
  clearJump: () => void
  setActiveSession: (index: number) => void
  setSearchOpen: (open: boolean) => void
  setExportOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  clearFlash: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  doc: null,
  sourceName: null,
  sourceKind: 'server',
  serverFiles: [],
  load: { phase: 'loading' },
  filter: 'all',
  view: 'chat',
  expandAllThinking: false,
  resolveAsset: serverAssetResolver,
  jumpTarget: null,
  jumpSmooth: false,
  forcedIds: new Set<string>(),
  activeSession: 0,
  flashId: null,
  searchOpen: false,
  exportOpen: false,
  settingsOpen: false,
  lightbox: null,

  openLightbox: (attachments, index) => set({ lightbox: { attachments, index } }),
  closeLightbox: () => set({ lightbox: null }),
  stepLightbox: (delta) => {
    const lb = get().lightbox
    if (!lb) return
    const n = lb.attachments.length
    set({ lightbox: { ...lb, index: (lb.index + delta + n) % n } })
  },

  bootstrap: async () => {
    set({ load: { phase: 'loading' } })
    const result = await loadFromServer()
    if (result.chat) {
      get().loadText(result.chat.name, result.chat.text, serverAssetResolver)
      set({ serverFiles: result.files, sourceKind: 'server' })
      return
    }
    // 服务器没有数据 → 尝试恢复上次手动打开的文档
    const stored = await loadLastDoc()
    if (stored) {
      const handle = await loadGrantedDirHandle()
      if (handle) {
        // 权限仍在：直接从文件夹读最新内容（比 IDB 快照新）
        const files = await walkDirectoryHandle(handle)
        const src = await sourceFromFiles(files)
        if (src) {
          get().loadText(src.name, src.text, src.resolver)
          set({ sourceKind: 'files' })
          return
        }
      }
      get().loadText(stored.name, stored.text, nullAssetResolver)
      set({ sourceKind: 'restored' })
      return
    }
    set({ load: { phase: 'empty', reason: result.failure } })
  },

  openFiles: async (files) => {
    const src = await sourceFromFiles(files)
    if (!src) {
      showToast('没有找到 .md 文件')
      return false
    }
    get().loadText(src.name, src.text, src.resolver)
    set({ sourceKind: 'files' })
    void saveLastDoc(src.name, src.text)
    return true
  },

  openDirectory: async () => {
    if (!supportsDirectoryPicker()) return false
    const picked = await pickDirectoryModern()
    if (!picked) return true // 用户取消，不再回退
    const ok = await get().openFiles(picked.files)
    if (ok) void saveDirHandle(picked.handle)
    return true
  },

  reconnectImages: async () => {
    const handle = await requestDirHandle()
    if (!handle) {
      showToast('请通过「打开文件夹」重新选择（含 assets 的目录）')
      return
    }
    const files = await walkDirectoryHandle(handle)
    const src = await sourceFromFiles(files)
    if (src) {
      get().loadText(src.name, src.text, src.resolver)
      set({ sourceKind: 'files' })
    }
  },

  loadText: (name, text, resolveAsset = serverAssetResolver) => {
    const parsed = parseChatlog(text)
    const issues = [...parsed.issues, ...lintChatDoc(parsed)]
    const doc = deriveDoc(parsed, issues)
    set({
      doc,
      sourceName: name,
      resolveAsset,
      load: { phase: 'ready' },
      view: 'chat',
      jumpTarget: null,
      forcedIds: new Set<string>(),
      lightbox: null,
    })
  },

  setFilter: (filter) => set({ filter }),
  setView: (view) => set({ view }),
  setExpandAllThinking: (expandAllThinking) => set({ expandAllThinking }),
  requestJump: (id, opts) =>
    set((s) => ({
      jumpTarget: id,
      jumpSmooth: !!opts?.smooth,
      view: 'chat',
      forcedIds: new Set(s.forcedIds).add(id),
      flashId: opts?.flash ? id : s.flashId,
    })),
  clearJump: () => set({ jumpTarget: null }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  clearFlash: () => set({ flashId: null }),
}))
