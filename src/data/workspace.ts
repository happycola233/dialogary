import { entries, get, setMany } from 'idb-keyval'
import type { HistoryEntry } from '../model/history'

export interface Revision {
  id: string
  at: number
  label: string
  text: string
}

export interface WorkspaceSnapshot {
  key: string
  name: string
  text: string
  baseline: string
  sourceKind: 'server' | 'files' | 'restored'
  assets: [string, File][]
  /** 已加入草稿但尚未写入授权目录的附件，刷新后仍需保存。 */
  pendingAssets?: string[]
  /** 从其他目录另行关联的附件，不能被日记目录的扫描结果覆盖。 */
  reconnectedAssetPaths?: string[]
  fileHandle?: FileSystemFileHandle
  directoryHandle?: FileSystemDirectoryHandle
  revisions: Revision[]
  /** 可逆操作随文档一起保存；旧版草稿没有这些字段时从空历史开始。 */
  past?: HistoryEntry[]
  future?: HistoryEntry[]
  messageIds?: string[]
  updatedAt: number
}

const LAST_KEY = 'dialogary:v2:workspace'
let writeQueue = Promise.resolve()

/** 按提交顺序落盘，较慢的旧快照不能覆盖新草稿。存储失败交给界面明确报告。 */
export function persistWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  // 在排队时固定快照，之后界面对数组的修改不能改变已提交的保存内容。
  const committed = structuredClone(snapshot)
  const next = writeQueue
    .catch(() => {})
    .then(async () => {
      await setMany([
        [`dialogary:v2:document:${committed.key}`, committed],
        [LAST_KEY, committed.key],
      ])
    })
  writeQueue = next
  return next
}

export async function restoreWorkspace(): Promise<WorkspaceSnapshot | null> {
  const key = await get<string>(LAST_KEY)
  return key ? ((await get<WorkspaceSnapshot>(`dialogary:v2:document:${key}`)) ?? null) : null
}

export async function workspaceFor(key: string): Promise<WorkspaceSnapshot | null> {
  return (await get<WorkspaceSnapshot>(`dialogary:v2:document:${key}`)) ?? null
}

export async function listWorkspaces(): Promise<WorkspaceSnapshot[]> {
  const saved = await entries<IDBValidKey, WorkspaceSnapshot>()
  return saved
    .filter(([key]) => typeof key === 'string' && key.startsWith('dialogary:v2:document:'))
    .map(([, workspace]) => workspace)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createRevision(text: string, label: string): Revision {
  return { id: crypto.randomUUID(), at: Date.now(), label, text }
}
