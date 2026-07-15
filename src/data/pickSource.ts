/** 模式 B：手动打开文件/文件夹/拖拽 */
import type { AssetResolver } from '../model/store'

export interface PickedFile {
  /** 相对路径（文件夹/拖拽模式下相对所选根目录；单文件为文件名） */
  relPath: string
  file: File
}

export interface PickedSource {
  name: string
  text: string
  resolver: AssetResolver
}

let activeObjectUrls: string[] = []

function revokeActiveUrls() {
  for (const url of activeObjectUrls) URL.revokeObjectURL(url)
  activeObjectUrls = []
}

/** 单文件模式：没有本地附件可解析 */
export const nullAssetResolver: AssetResolver = () => null

/**
 * 文件夹模式的附件解析：相对路径 → objectURL（缓存；换源时统一 revoke）。
 * key 归一化：NFC（macOS NFD 文件名）+ 小写兜底 + 文件名兜底。
 */
export function createFileAssetResolver(fileMap: Map<string, File>): AssetResolver {
  revokeActiveUrls()
  const cache = new Map<string, string | null>()
  const lower = new Map<string, File>()
  const byName = new Map<string, File>()
  for (const [k, f] of fileMap) {
    lower.set(k.toLowerCase(), f)
    const base = k.split('/').pop()!
    if (!byName.has(base)) byName.set(base, f)
  }
  return (path) => {
    if (!path) return null
    if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
    const clean = path.replace(/\\/g, '/').replace(/^\.\//, '').normalize('NFC')
    if (cache.has(clean)) return cache.get(clean)!
    const file =
      fileMap.get(clean) ??
      lower.get(clean.toLowerCase()) ??
      byName.get(clean.split('/').pop()!)
    const url = file ? URL.createObjectURL(file) : null
    if (url) activeObjectUrls.push(url)
    cache.set(clean, url)
    return url
  }
}

/**
 * 从一组带相对路径的文件构建数据源：
 * 找到 *.chat.md（多个时取路径最浅、名字最短的），其余文件按「相对聊天文件所在目录」注册为附件。
 */
export async function sourceFromFiles(files: PickedFile[]): Promise<PickedSource | null> {
  const byDepth = (a: PickedFile, b: PickedFile) =>
    a.relPath.split('/').length - b.relPath.split('/').length || a.relPath.length - b.relPath.length
  const chats = files.filter((f) => f.relPath.endsWith('.chat.md')).sort(byDepth)
  // 没有 *.chat.md 时退而求其次接受任意 .md
  const chat = chats[0] ?? files.filter((f) => f.relPath.endsWith('.md')).sort(byDepth)[0]
  if (!chat) return null

  const chatDir = chat.relPath.includes('/') ? chat.relPath.slice(0, chat.relPath.lastIndexOf('/') + 1) : ''
  const fileMap = new Map<string, File>()
  for (const f of files) {
    if (f === chat) continue
    const rel = (f.relPath.startsWith(chatDir) ? f.relPath.slice(chatDir.length) : f.relPath).normalize('NFC')
    fileMap.set(rel, f.file)
  }

  const text = await chat.file.text()
  const name = chat.relPath.split('/').pop()!
  return {
    name,
    text,
    resolver: fileMap.size ? createFileAssetResolver(fileMap) : nullAssetResolver,
  }
}

/** <input> 的 FileList（含 webkitdirectory 的 webkitRelativePath） */
export function filesFromInput(list: FileList): PickedFile[] {
  return [...list].map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    // webkitRelativePath 以所选文件夹名开头，去掉这一层
    const parts = rel.split('/')
    return { relPath: (parts.length > 1 ? parts.slice(1).join('/') : rel).normalize('NFC'), file }
  })
}

/** 拖拽：递归遍历 webkitGetAsEntry 的目录树 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = []
  const entries = [...dt.items]
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null)

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      out.push({ relPath: (prefix + entry.name).normalize('NFC'), file })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // readEntries 每批最多 100 个，要循环读到空
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        )
        if (batch.length === 0) break
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
      }
    }
  }

  // 顶层：拖入单个文件夹时不保留文件夹名这一层，与 input 行为一致
  if (entries.length === 1 && entries[0]!.isDirectory) {
    const root = entries[0] as FileSystemDirectoryEntry
    const reader = root.createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) await walk(child, '')
    }
  } else {
    for (const entry of entries) await walk(entry, '')
  }
  return out
}

/** Chromium File System Access API：目录句柄递归遍历 */
export async function walkDirectoryHandle(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<PickedFile[]> {
  const out: PickedFile[] = []
  for await (const [name, handle] of dir as unknown as AsyncIterable<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  >) {
    if (handle.kind === 'file') {
      out.push({ relPath: (prefix + name).normalize('NFC'), file: await handle.getFile() })
    } else {
      out.push(...(await walkDirectoryHandle(handle, `${prefix}${name}/`)))
    }
  }
  return out
}

export function supportsDirectoryPicker(): boolean {
  return 'showDirectoryPicker' in window
}

export async function pickDirectoryModern(): Promise<{ handle: FileSystemDirectoryHandle; files: PickedFile[] } | null> {
  try {
    const handle = await (
      window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker({ mode: 'read' })
    return { handle, files: await walkDirectoryHandle(handle) }
  } catch {
    return null // 用户取消或不支持
  }
}
