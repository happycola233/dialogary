import type { DerivedMessage } from '../model/derive'

/**
 * 按 Markdown 的显式行与软换行粗估占位高度。
 * 正确性不依赖这个估值；它只负责让尚未挂载区域的滚动条更接近最终长度。
 */
function estimateMarkdownHeight(text: string): number {
  if (!text) return 0
  let nonEmptyLines = 0
  let blankLines = 0
  let blockCount = 0

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      blankLines += 1
      continue
    }
    nonEmptyLines += 1
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/.test(trimmed)) blockCount += 1
  }

  // 字符数适合普通段落；显式行下限补足短列表、代码和表格，二者取大避免重复计数。
  const wrappedTextHeight = text.length * 0.55
  const explicitLineHeight = nonEmptyLines * 10 + blankLines * 3
  return Math.max(wrappedTextHeight, explicitLineHeight) + blockCount * 3
}

/** 占位估值会计入显式换行、附件行数和折叠思考栏。 */
export function estimateMessagePlaceholderHeight(message: DerivedMessage): number {
  let height = message.role === 'user' ? 38 : 46
  height += estimateMarkdownHeight(message.content)

  const imageCount = message.attachments.filter((attachment) => attachment.kind === 'image').length
  const fileCount = message.attachments.length - imageCount
  if (imageCount) height += Math.ceil(imageCount / 2) * 188
  if (fileCount) height += Math.ceil(fileCount / 3) * 38
  if (message.thinking) height += 36
  return Math.round(Math.max(64, height))
}
