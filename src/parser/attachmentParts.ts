import type { Attachment, MessagePart, Metadata } from './types'

function semanticKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  )
}

function attachmentOf(part: MessagePart): Attachment | null {
  const data = part.data
  if (
    part.kind !== 'attachment' ||
    !data ||
    !['image', 'file'].includes(String(data.kind)) ||
    typeof data.name !== 'string'
  )
    return null
  return {
    kind: data.kind as Attachment['kind'],
    name: data.name,
    path: typeof data.path === 'string' ? data.path : null,
    meta:
      data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
        ? (data.meta as Metadata)
        : {},
  }
}

/** 修改附件列表时，扩展字段跟随原附件，正文两侧仍存在的附件位置保持不动。 */
export function syncAttachmentParts(
  parts: MessagePart[],
  attachments: Attachment[],
): MessagePart[] {
  const previous = parts.flatMap((part, position) => {
    const attachment = attachmentOf(part)
    return attachment ? [{ part, position, attachment, key: semanticKey(attachment) }] : []
  })
  const matches: (number | undefined)[] = Array(attachments.length).fill(undefined)
  const used = new Set<number>()
  const match = (equal: (attachment: Attachment, old: (typeof previous)[number]) => boolean) => {
    attachments.forEach((attachment, index) => {
      if (matches[index] !== undefined) return
      const found = previous.findIndex(
        (old, oldIndex) => !used.has(oldIndex) && equal(attachment, old),
      )
      if (found >= 0) {
        matches[index] = found
        used.add(found)
      }
    })
  }
  // 先识别完整保留的附件，避免同名文件被较弱的名称匹配提前占走。
  match((attachment, old) => semanticKey(attachment) === old.key)
  match((attachment, old) => attachment.path !== null && attachment.path === old.attachment.path)
  match((attachment, old) => attachment.name === old.attachment.name)
  const remainingOld = previous.map((_, index) => index).filter((index) => !used.has(index))
  const remainingNew = attachments
    .map((_, index) => index)
    .filter((index) => matches[index] === undefined)
  if (remainingOld.length === remainingNew.length)
    remainingNew.forEach((index, offset) => {
      matches[index] = remainingOld[offset]!
    })

  const replacements = attachments.map((attachment, index): MessagePart => {
    const oldIndex = matches[index]
    if (oldIndex === undefined) return { kind: 'attachment', data: { ...attachment } }
    const old = previous[oldIndex]!
    if (semanticKey(attachment) === old.key) return old.part
    const data = { ...old.part.data }
    for (const key of ['kind', 'name', 'path'] as const)
      if (attachment[key] !== old.attachment[key]) data[key] = attachment[key]
    if (semanticKey(attachment.meta) !== semanticKey(old.attachment.meta))
      data.meta = attachment.meta
    return { ...old.part, data }
  })
  const retainedPositions = new Set(
    matches.flatMap((index) => (index === undefined ? [] : [previous[index]!.position])),
  )
  const oldPositions = new Set(previous.map((old) => old.position))
  const lastPosition = previous.at(-1)?.position
  const result: MessagePart[] = []
  let next = 0
  parts.forEach((part, position) => {
    if (!oldPositions.has(position)) result.push(part)
    else if (retainedPositions.has(position)) result.push(replacements[next++]!)
    // 新增附件扩展原来的末个附件组，避免跑到随后的文字之后。
    if (position === lastPosition) result.push(...replacements.slice(next))
  })
  if (lastPosition === undefined) result.push(...replacements)
  return result
}
