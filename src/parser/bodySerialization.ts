import { RE } from './chatlog-v1'
import type { MessagePart, SourceFragment } from './types'

type PartStyle = NonNullable<SourceFragment['bodyParts']>[number]['style']
type PartWriter = (part: MessagePart, raw?: string) => string

/** 简写必须可以无歧义地读回；带块 ID、正文或扩展属性时继续使用显式块。 */
function simpleAttachment(part: MessagePart): string | null {
  const data = part.data
  if (
    part.id !== undefined ||
    part.text ||
    Object.keys(part).some((key) => !['kind', 'data', 'text'].includes(key)) ||
    !data ||
    !['image', 'file'].includes(String(data.kind)) ||
    typeof data.name !== 'string' ||
    !(data.path === null || typeof data.path === 'string') ||
    Object.keys(data).some((key) => !['kind', 'name', 'path', 'meta'].includes(key)) ||
    (data.meta !== undefined &&
      (data.meta === null ||
        typeof data.meta !== 'object' ||
        Array.isArray(data.meta) ||
        Object.keys(data.meta).length > 0))
  )
    return null
  const marker = data.kind === 'image' ? '🖼️' : '📄'
  const line =
    data.path === null ? `${marker} ${data.name}` : `${marker} [${data.name}](${data.path})`
  if (/[\r\n]/.test(line)) return null
  const linked = RE.ATTACH_LINK_RE.exec(line)
  const named = linked ? null : RE.ATTACH_NAME_RE.exec(line)
  return (linked?.[2] ?? named?.[2]) === data.name && (linked?.[3] || null) === data.path
    ? line
    : null
}

function renderPart(
  part: MessagePart,
  index: number,
  parts: MessagePart[],
  style: PartStyle | undefined,
  explicit: PartWriter,
  escape: (text: string) => string,
  raw?: string,
): string {
  if (style === 'explicit') return explicit(part, raw)
  if (part.kind === 'attachment') return simpleAttachment(part) ?? explicit(part)
  const hasProperties =
    part.id !== undefined ||
    Object.keys(part.data ?? {}).length > 0 ||
    Object.keys(part).some((key) => !['kind', 'text', 'data'].includes(key))
  if (
    part.kind === 'answer' &&
    !hasProperties &&
    parts[index - 1]?.kind !== 'answer' &&
    parts[index + 1]?.kind !== 'answer'
  ) {
    return escape(part.text ?? '')
  }
  if (
    part.kind === 'reasoning' &&
    index === 0 &&
    part.id === undefined &&
    Object.keys(part).every((key) => ['kind', 'text', 'data'].includes(key)) &&
    Object.keys(part.data ?? {}).every((key) => key === 'label') &&
    typeof part.data?.label === 'string' &&
    !/[\r\n]/.test(part.data.label)
  ) {
    return `> 🤔 ${part.data.label}\n>\n${(part.text ?? '')
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')}`
  }
  return explicit(part)
}

/** 优先替换原位置上的已改块；新增、删除、移动时仍复用未修改块的原文。 */
export function serializeBodyParts(
  parts: MessagePart[],
  previous: MessagePart[],
  source: SourceFragment | undefined,
  explicit: PartWriter,
  escape: (text: string) => string,
): string {
  const body = source?.raw.slice(source.bodyStart).replace(/\r\n/g, '\n') ?? ''
  const fragments = source?.bodyParts
  const keys = previous.map((part) => JSON.stringify(part))
  const write = (part: MessagePart, index: number, style?: PartStyle) =>
    renderPart(
      part,
      index,
      parts,
      style,
      explicit,
      escape,
      style === 'explicit'
        ? body.slice(fragments![index]!.start, fragments![index]!.end)
        : undefined,
    )

  const aligned =
    fragments?.length === parts.length &&
    previous.every((part, index) => part.kind === parts[index]?.kind)
  const used = new Set<number>()
  const origins: number[] = []
  const blocks = parts.map((part, index) => {
    const key = JSON.stringify(part)
    const oldIndex = keys.findIndex((value, position) => value === key && !used.has(position))
    origins.push(oldIndex)
    if (oldIndex >= 0 && fragments?.[oldIndex]) {
      used.add(oldIndex)
      const fragment = fragments[oldIndex]
      // 简写思考只在消息开头有结构含义，移动后需要显式标记。
      const movedToStart = fragment.style === 'plain' && index === 0 && oldIndex !== 0
      const adjacentAnswer =
        fragment.style === 'plain' &&
        (parts[index - 1]?.kind === 'answer' || parts[index + 1]?.kind === 'answer')
      if (!movedToStart && !adjacentAnswer && (fragment.style !== 'reasoning' || index === 0))
        return body.slice(fragment.start, fragment.end)
    }
    return write(part, index, aligned ? fragments![index]!.style : undefined)
  })
  if (aligned) {
    let cursor = 0
    let result = ''
    for (const [index, block] of blocks.entries()) {
      const fragment = fragments![index]!
      result += body.slice(cursor, fragment.start) + block
      cursor = fragment.end
    }
    return result + body.slice(cursor)
  }

  const gapBefore = (index: number) =>
    fragments?.[index] && index > 0
      ? body.slice(fragments[index - 1]!.end, fragments[index]!.start)
      : undefined
  const content = blocks
    .map((block, index) => {
      if (!index) return block
      const before = origins[index - 1]!
      const current = origins[index]!
      let gap: string | undefined
      if (before >= 0 && current === before + 1) gap = gapBefore(current)
      // 图片增删不应顺带压缩相邻正文的空行；新图片之间保持一行一个。
      else if (parts[index - 1]!.kind === 'answer' && before >= 0) gap = gapBefore(before + 1)
      else if (parts[index]!.kind === 'answer' && current >= 0) gap = gapBefore(current)
      gap ??=
        parts[index - 1]!.kind === 'attachment' && parts[index]!.kind === 'attachment'
          ? '\n'
          : '\n\n'
      return gap + block
    })
    .join('')
  const prefix = origins[0] === 0 && fragments?.[0] ? body.slice(0, fragments[0].start) : '\n'
  const last = fragments?.at(-1)
  const suffix = last && origins.at(-1) === fragments!.length - 1 ? body.slice(last.end) : '\n\n'
  return prefix + content + suffix
}
