/** 模式 A：自动加载与应用一同部署的 public/data/ 下的 *.chat.md */

export interface ServerChat {
  name: string
  text: string
}

export type FetchFailure = 'file-protocol' | 'not-found' | 'network'

export interface FetchResult {
  chat: ServerChat | null
  failure: FetchFailure | null
  /** manifest 列出的全部候选文件（供多文件切换） */
  files: string[]
}

/** 中文文件名必须显式按段百分号编码，不依赖浏览器自动处理 */
export function dataUrl(relPath: string): string {
  return (
    'data/' +
    relPath
      .replace(/\\/g, '/')
      .split('/')
      .map(encodeURIComponent)
      .join('/')
  )
}

export async function loadFromServer(preferred?: string | null): Promise<FetchResult> {
  if (location.protocol === 'file:') return { chat: null, failure: 'file-protocol', files: [] }

  let files: string[] = []
  try {
    const res = await fetch(dataUrl('manifest.json'), { cache: 'no-store' })
    if (res.ok) {
      const body = (await res.json()) as { files?: unknown }
      if (Array.isArray(body.files)) files = body.files.filter((f): f is string => typeof f === 'string')
    }
  } catch {
    return { chat: null, failure: 'network', files: [] }
  }

  const ordered = preferred && files.includes(preferred) ? [preferred, ...files.filter((f) => f !== preferred)] : files
  for (const name of ordered) {
    try {
      const res = await fetch(dataUrl(name))
      if (res.ok) return { chat: { name, text: await res.text() }, failure: null, files }
    } catch {
      // 尝试下一个候选
    }
  }
  return { chat: null, failure: 'not-found', files }
}

/** 服务器模式的附件解析：相对路径 → /data/ 下的编码 URL */
export function serverAssetResolver(path: string | null): string | null {
  if (!path) return null
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  const clean = path.replace(/\\/g, '/').replace(/^\.\//, '')
  if (clean.split('/').includes('..')) return null
  return dataUrl(clean)
}
