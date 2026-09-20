export interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>
}

const markdownTypes = [{ description: '对话日记', accept: { 'text/markdown': ['.md'] } }]

export async function chooseFile(): Promise<FileSystemFileHandle | null | undefined> {
  const picker = (window as FilePickerWindow).showOpenFilePicker
  if (!picker) return undefined
  try {
    return (await picker.call(window, { types: markdownTypes, multiple: false }))[0] ?? null
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

export async function chooseSaveFile(name: string): Promise<FileSystemFileHandle | null | undefined> {
  const picker = (window as FilePickerWindow).showSaveFilePicker
  if (!picker) return undefined
  try {
    return await picker.call(window, { suggestedName: name, types: markdownTypes })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

export async function writeFile(handle: FileSystemFileHandle, text: string | Blob): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
}

/** 只允许在授权目录内创建附件；相对路径来自文件输入这一系统边界。 */
export async function writeAsset(directory: FileSystemDirectoryHandle, path: string, file: File): Promise<void> {
  const segments = path.replaceAll('\\', '/').split('/')
  if (segments.some((part) => !part || part === '..' || part === '.' || /[\0:]/.test(part))) throw new Error('附件路径无效')
  let parent = directory
  for (const part of segments.slice(0, -1)) parent = await parent.getDirectoryHandle(part, { create: true })
  const name = segments.at(-1)!
  let existing: FileSystemFileHandle | undefined
  try { existing = await parent.getFileHandle(name) } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
  if (existing) {
    const previous = await existing.getFile()
    const originalBytes = new Uint8Array(await previous.arrayBuffer())
    const nextBytes = new Uint8Array(await file.arrayBuffer())
    if (originalBytes.length === nextBytes.length && originalBytes.every((byte, index) => byte === nextBytes[index])) return
    throw new Error(`附件「${name}」已存在且内容不同，请更换文件名后保存`)
  }
  await writeFile(await parent.getFileHandle(name, { create: true }), file)
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(name: string, text: string): void {
  downloadBlob(name, new Blob([text], { type: 'text/markdown;charset=utf-8' }))
}
