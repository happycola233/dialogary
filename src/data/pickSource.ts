/** 模式 B：手动打开文件/文件夹/拖拽 */
import type { AssetResolver } from '../model/store'

export interface PickedFile {
  /** 相对路径（文件夹/拖拽模式下相对所选根目录；单文件为文件名） */
  relPath: string
  file: File
  handle?: FileSystemFileHandle
}

export interface PickedSource {
  name: string
  text: string
  assets: Map<string, File>
  handle?: FileSystemFileHandle
}

let activeObjectUrls: string[] = []

const ignoredDirectories = new Set(['.git', '.tmp', '.devfiles', '.dialogary-backups', 'node_modules', 'dist', '__macosx', 'backup', 'backups', '备份'])
const slashPath = (value: string) => value.replaceAll('\\', '/')
const isExcludedPath = (value: string) => slashPath(value).split('/').slice(0, -1).some((part) => ignoredDirectories.has(part.toLowerCase()))

function chatFileFrom(files: PickedFile[], preferredName?: string): PickedFile | undefined {
  const byDepth = (a: PickedFile, b: PickedFile) => a.relPath.split('/').length - b.relPath.split('/').length || a.relPath.length - b.relPath.length || a.relPath.localeCompare(b.relPath)
  const available = files.filter((file) => !isExcludedPath(file.relPath))
  if (preferredName !== undefined) {
    const preferred = slashPath(preferredName).normalize('NFC')
    const nameOf = (file: PickedFile) => (preferred.includes('/') ? file.relPath : file.relPath.split('/').at(-1)!).normalize('NFC')
    const exact = available.filter((file) => /\.md$/i.test(file.relPath) && nameOf(file) === preferred)
    if (exact.length) return exact.length === 1 ? exact[0] : undefined
    const compatible = available.filter((file) => /\.md$/i.test(file.relPath) && nameOf(file).toLowerCase() === preferred.toLowerCase())
    return compatible.length === 1 ? compatible[0] : undefined
  }
  return available.filter((file) => /\.chat\.md$/i.test(file.relPath)).sort(byDepth)[0] ?? available.filter((file) => /\.md$/i.test(file.relPath)).sort(byDepth)[0]
}

/** 只归一化路径，不用文件名猜测目录；../ 只允许引用所选树内已注册的文件。 */
function normalizeRelativePath(value: string): string | null {
  const path = slashPath(value)
  if (/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(path) || path.includes('\0')) return null
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..' && segments.length && segments.at(-1) !== '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/').normalize('NFC')
}

function relativeFrom(directory: string, target: string): string {
  const from = slashPath(directory).split('/').filter(Boolean)
  const to = slashPath(target).split('/').filter(Boolean)
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common++
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/')
}

function revokeActiveUrls() {
  for (const url of activeObjectUrls) URL.revokeObjectURL(url)
  activeObjectUrls = []
}

/** 单文件模式：没有本地附件可解析 */
export const nullAssetResolver: AssetResolver = (path) => path && /^(?:(?:https?:)?\/\/|data:image\/|blob:)/i.test(path) ? path : null

/**
 * 文件夹模式的附件解析：相对路径 → objectURL（缓存；换源时统一 revoke）。
 * 百分号编码与 NFC 文件名可解析；大小写兼容仅在路径唯一时使用，绝不按 basename 猜图。
 */
export function createFileAssetResolver(fileMap: Map<string, File>): AssetResolver {
  revokeActiveUrls()
  const cache = new Map<string, string | null>()
  const exact = new Map<string, File | null>()
  const lower = new Map<string, File | null>()
  const register = (map: Map<string, File | null>, key: string, file: File) => {
    map.set(key, map.has(key) && map.get(key) !== file ? null : file)
  }
  for (const [k, f] of fileMap) {
    const clean = normalizeRelativePath(k)
    if (clean === null) continue
    register(exact, clean, f)
    register(lower, clean.toLowerCase(), f)
  }
  return (path) => {
    if (!path) return null
    const remote = nullAssetResolver(path)
    if (remote) return remote
    if (cache.has(path)) return cache.get(path)!
    const candidates = [normalizeRelativePath(path)]
    try { candidates.push(normalizeRelativePath(decodeURIComponent(path.split(/[?#]/)[0]!))) } catch { /* 字面百分号文件名仍可按精确路径找到。 */ }
    let file: File | null | undefined
    for (const candidate of candidates) {
      if (candidate === null) continue
      file = exact.has(candidate) ? exact.get(candidate) : lower.get(candidate.toLowerCase())
      if (file) break
    }
    const url = file ? URL.createObjectURL(file) : null
    if (url) activeObjectUrls.push(url)
    cache.set(path, url)
    return url
  }
}

/**
 * 从一组带相对路径的文件构建数据源：
 * 找到 *.chat.md（多个时取路径最浅、名字最短的），其余文件按「相对聊天文件所在目录」注册为附件。
 * 重新关联时指定 preferredName；找不到或同名存在歧义时返回 null，绝不换成另一本日记。
 * 这里只读取数据；调用方实际切换附件时再创建解析器，避免目录扫描撤销当前图片的 URL。
 */
export async function sourceFromFiles(files: PickedFile[], preferredName?: string): Promise<PickedSource | null> {
  const normalizedFiles = files.map((file) => ({ ...file, relPath: slashPath(file.relPath) }))
  const chat = chatFileFrom(normalizedFiles, preferredName)
  if (!chat) return null

  const chatDir = chat.relPath.includes('/') ? chat.relPath.slice(0, chat.relPath.lastIndexOf('/') + 1) : ''
  const fileMap = new Map<string, File>()
  for (const f of normalizedFiles) {
    if (f === chat || isExcludedPath(f.relPath) || /\.chat\.md$/i.test(f.relPath)) continue
    const rel = relativeFrom(chatDir, f.relPath)
    fileMap.set(rel, f.file)
  }

  const text = await chat.file.text()
  const name = chat.relPath.split('/').pop()!
  return {
    name,
    text,
    assets: fileMap,
    handle: chat.handle,
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
    } else if (entry.isDirectory && !ignoredDirectories.has(entry.name.toLowerCase())) {
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
      out.push({ relPath: (prefix + name).normalize('NFC'), file: await handle.getFile(), handle })
    } else if (!ignoredDirectories.has(name.toLowerCase())) {
      out.push(...(await walkDirectoryHandle(handle, `${prefix}${name}/`)))
    }
  }
  return out
}

/** 重新读取已授权目录中的附件，路径与首次打开文件夹时一致（相对日记文件）。 */
export async function assetsFromDirectory(directory: FileSystemDirectoryHandle, chatName: string): Promise<Map<string, File> | null> {
  return (await sourceFromFiles(await walkDirectoryHandle(directory), chatName))?.assets ?? null
}

export function supportsDirectoryPicker(): boolean {
  return 'showDirectoryPicker' in window
}

export async function pickDirectoryModern(): Promise<{ handle: FileSystemDirectoryHandle; files: PickedFile[] } | null> {
  try {
    const handle = await (
      window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker({ mode: 'read' })
    const files = await walkDirectoryHandle(handle)
    const chat = chatFileFrom(files)
    let chatDirectory = handle
    // 写回基准必须是 Markdown 所在目录，而不是用户选中的更高层目录。
    if (chat) for (const segment of chat.relPath.split('/').slice(0, -1)) chatDirectory = await chatDirectory.getDirectoryHandle(segment)
    return { handle: chatDirectory, files }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}
