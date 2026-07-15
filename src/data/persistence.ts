/** 最近打开的文档持久化：文本进 IndexedDB（~1MB 无压力），Chromium 下额外存目录句柄以恢复图片 */
import { del, get, set } from 'idb-keyval'

const KEY_DOC = 'dialogary:last-doc'
const KEY_DIR = 'dialogary:last-dir-handle'

export interface StoredDoc {
  name: string
  text: string
  openedAt: number
}

export async function saveLastDoc(name: string, text: string): Promise<void> {
  try {
    await set(KEY_DOC, { name, text, openedAt: Date.now() } satisfies StoredDoc)
  } catch {
    // 存储不可用（隐私模式等）时静默失败
  }
}

export async function loadLastDoc(): Promise<StoredDoc | null> {
  try {
    return (await get<StoredDoc>(KEY_DOC)) ?? null
  } catch {
    return null
  }
}

export async function clearLastDoc(): Promise<void> {
  try {
    await del(KEY_DOC)
    await del(KEY_DIR)
  } catch {
    // 同上
  }
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await set(KEY_DIR, handle)
  } catch {
    // FileSystemHandle 不可结构化克隆的环境（非 Chromium）直接忽略
  }
}

/** 取回目录句柄；仅当权限仍为 granted（或静默可得）时返回，不弹权限框 */
export async function loadGrantedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await get<FileSystemDirectoryHandle>(KEY_DIR)
    if (!handle) return null
    const perm = await (
      handle as unknown as { queryPermission: (o: { mode: string }) => Promise<string> }
    ).queryPermission({ mode: 'read' })
    return perm === 'granted' ? handle : null
  } catch {
    return null
  }
}

/** 用户手势里调用：必要时弹权限框 */
export async function requestDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await get<FileSystemDirectoryHandle>(KEY_DIR)
    if (!handle) return null
    const h = handle as unknown as {
      queryPermission: (o: { mode: string }) => Promise<string>
      requestPermission: (o: { mode: string }) => Promise<string>
    }
    if ((await h.queryPermission({ mode: 'read' })) === 'granted') return handle
    if ((await h.requestPermission({ mode: 'read' })) === 'granted') return handle
    return null
  } catch {
    return null
  }
}
