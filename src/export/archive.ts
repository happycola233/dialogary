import { strToU8 } from 'fflate'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import { visit } from 'unist-util-visit'
import type { ChatDoc } from '../parser/types'
import type { AssetResolver } from '../model/store'
import { downloadBlob } from '../data/fileAccess'
import { buildZip } from './buildZip'

// 归档只读取树上的链接，绝不渲染 HTML；与正文一致地识别引用式链接、转义及围栏边界。
const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)

function localPath(value: string, isUrl: boolean): string | null {
  if (/^(?:https?:|data:|mailto:|tel:|\/\/|#)/i.test(value)) return null
  if (/^(?:file:|[a-z]:[\\/]|[\\/])/i.test(value))
    throw new Error(`附件路径「${value}」无法放入归档，请改为日记所在目录内的相对路径。`)
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null
  // Markdown 链接中的 #片段 / ?查询不属于文件名；元数据 path 则允许直接填写实际文件名。
  let path = isUrl ? value.split(/[?#]/, 1)[0]! : value
  try {
    path = decodeURIComponent(path)
  } catch {
    /* 实际文件名允许包含未编码的 %，此时保持原名。 */
  }
  path = path.replaceAll('\\', '/')
  const segments = path.split('/').filter((segment) => segment !== '.')
  if (segments.some((segment) => segment === '..') || /^(?:\/|[a-z]:)/i.test(path) || path.includes('\0')) {
    throw new Error(`附件路径「${value}」无法放入归档，请先把附件移到日记所在目录内并更新引用。`)
  }
  path = segments.join('/')
  return path || null
}

/** 收集真正被引用的本地文件；缺失和无法封装的引用都必须报告，不能静默丢失。 */
export function localReferences(doc: ChatDoc): string[] {
  const paths = new Set<string>()
  const add = (value: unknown, isUrl = false) => {
    if (typeof value !== 'string' || !value) return
    const path = localPath(value, isUrl)
    if (path) paths.add(path)
  }
  const scan = (text: string | undefined) => {
    if (!text) return
    const tree = markdown.runSync(markdown.parse(text))
    visit(tree, 'element', (node) => {
      if (node.tagName === 'a') add(node.properties.href, true)
      if (['img', 'audio', 'video', 'source'].includes(node.tagName)) add(node.properties.src, true)
      if (node.tagName === 'video') add(node.properties.poster, true)
    })
  }
  for (const session of doc.sessions) {
    for (const annotation of session.annotations ?? []) scan(annotation.text)
    for (const message of session.messages) {
      for (const attachment of message.attachments) add(attachment.path)
      // parts 的 answer/reasoning 已是 content/thinking 的投影，Set 自然去重附件路径。
      scan(message.content)
      scan(message.thinking?.text)
      for (const part of message.parts ?? []) {
        scan(part.text)
        if (part.kind === 'attachment') add(part.data?.path)
      }
      for (const annotation of message.annotations ?? []) scan(annotation.text)
    }
  }
  return [...paths]
}

export async function exportArchive(
  name: string,
  text: string,
  doc: ChatDoc,
  assets: Map<string, File>,
  resolve: AssetResolver,
): Promise<void> {
  const filename = name.split(/[\\/]/).at(-1)!
  const entries: Record<string, Uint8Array> = Object.create(null)
  entries[filename] = strToU8(text)
  const missing: string[] = []
  const localFiles = new Map(
    [...assets].map(([path, file]) => [path.replaceAll('\\', '/').normalize('NFC').toLowerCase(), file]),
  )
  for (const path of localReferences(doc)) {
    if (path === filename) continue // 指向档案自己的相对链接已由根文件满足。
    const local = assets.get(path) ?? localFiles.get(path.normalize('NFC').toLowerCase())
    if (local) {
      entries[path] = new Uint8Array(await local.arrayBuffer())
      continue
    }
    const url = resolve(path)
    // 阅读器允许按文件名寻找图片；归档必须匹配完整路径，不能误封装另一个同名文件。
    if (!url || url.startsWith('blob:')) {
      missing.push(path)
      continue
    }
    try {
      const response = await fetch(url, { headers: { Accept: 'application/octet-stream' } })
      // 静态服务器可能把不存在的资源回退为 index.html；HTML 附件应由已打开的文件夹提供。
      const htmlFallback = response.headers.get('content-type')?.includes('text/html')
      if (!response.ok || htmlFallback) missing.push(path)
      else entries[path] = new Uint8Array(await response.arrayBuffer())
    } catch {
      missing.push(path)
    }
  }
  if (missing.length)
    throw new Error(
      `有 ${missing.length} 个附件未找到，请先打开包含附件的文件夹：${missing.slice(0, 3).join('、')}`,
    )
  const bytes = await buildZip(Object.entries(entries).map(([path, data]) => ({ path, data })))
  downloadBlob(
    filename.replace(/\.chat\.md$|\.md$/i, '') + '.zip',
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
  )
}
