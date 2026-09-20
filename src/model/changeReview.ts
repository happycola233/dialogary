import { diffChars, diffLines } from 'diff'
import { parseChatlog } from '../parser/chatlog'
import type { Message } from '../parser/types'

export interface ReviewLine {
  kind: 'context' | 'removed' | 'added'
  text: string
  ending: string
  beforeLine: number | null
  afterLine: number | null
  emphasis?: { text: string; changed: boolean }[]
}

export interface ReviewHunk {
  id: number
  title: string
  fields: string[]
  rows: ReviewLine[]
  beforeStart: number | null
  afterStart: number | null
  hiddenBefore: number
}

export interface ChangeReview {
  added: number
  removed: number
  hunks: ReviewHunk[]
  rows: ReviewLine[]
  hiddenAfter: number
}

const FIELD_NAMES: Record<string, string> = {
  content: '正文',
  thinking: '思考',
  attachments: '附件',
  parts: '过程',
  tags: '标签',
  reactions: '表情',
  mood: '心情',
  states: '状态',
  starred: '收藏',
  annotations: '批注',
  model: '模型',
  modelInfo: '模型',
  usage: 'Token 用量',
  role: '记录人',
  time: '时间',
  id: '记录编号',
  meta: '其他信息',
}

function fieldValue(message: Message, key: string): unknown {
  // 已归一化的元数据不再重复归入“其他信息”；正文块也不算额外的过程修改。
  if (key === 'meta') {
    const known = new Set([
      'id',
      'tags',
      'reactions',
      'mood',
      'states',
      'starred',
      'annotations',
      'model',
      'reasoning',
      'usage',
    ])
    return Object.fromEntries(Object.entries(message.meta).filter(([name]) => !known.has(name)))
  }
  if (key === 'parts') return message.parts?.filter((part) => part.kind !== 'answer') ?? []
  return message[key as keyof Message]
}

/** 保留换行符和文件末尾状态；展示可以折叠上下文，比较本身不忽略任何字节。 */
export function buildChangeReview(before: string, after: string): ChangeReview {
  const rows: ReviewLine[] = []
  let beforeLine = 1
  let afterLine = 1
  let added = 0
  let removed = 0
  for (const change of diffLines(before, after)) {
    const lines = change.value.match(/[^\n]*\n|[^\n]+$/g) ?? []
    for (const line of lines) {
      const ending = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : ''
      rows.push({
        kind: change.added ? 'added' : change.removed ? 'removed' : 'context',
        text: ending ? line.slice(0, -ending.length) : line,
        ending,
        beforeLine: change.added ? null : beforeLine++,
        afterLine: change.removed ? null : afterLine++,
      })
      if (change.added) added++
      if (change.removed) removed++
    }
  }
  // 只对相邻替换行计算字符差异；长行仍完整展示，避免逐字符比较阻塞阅读。
  for (let i = 0; i < rows.length;) {
    if (rows[i]!.kind !== 'removed') {
      i++
      continue
    }
    const removedRows: ReviewLine[] = []
    const addedRows: ReviewLine[] = []
    while (rows[i]?.kind === 'removed') removedRows.push(rows[i++]!)
    while (rows[i]?.kind === 'added') addedRows.push(rows[i++]!)
    for (let pair = 0; pair < Math.min(removedRows.length, addedRows.length); pair++) {
      const oldRow = removedRows[pair]!
      const newRow = addedRows[pair]!
      const chars = diffChars(oldRow.text, newRow.text, { timeout: 15, maxEditLength: 1200 })
      if (!chars) continue
      oldRow.emphasis = chars
        .filter((part) => !part.added)
        .map((part) => ({ text: part.value, changed: part.removed }))
      newRow.emphasis = chars
        .filter((part) => !part.removed)
        .map((part) => ({ text: part.value, changed: part.added }))
    }
  }
  const ranges: { start: number; end: number }[] = []
  rows.forEach((row, index) => {
    if (row.kind === 'context') return
    const start = Math.max(0, index - 3)
    const end = Math.min(rows.length, index + 4)
    const last = ranges.at(-1)
    if (last && start <= last.end) last.end = end
    else ranges.push({ start, end })
  })
  const oldDoc = parseChatlog(before)
  const newDoc = parseChatlog(after)
  const locate = (doc: typeof oldDoc, line: number | null) => {
    if (line === null) return null
    let found: {
      title: string
      message: (typeof doc.sessions)[number]['messages'][number] | null
    } | null = null
    for (const session of doc.sessions) {
      if (session.line > line) break
      const date = session.date ?? '未标日期'
      found = { title: `${date} · 日期信息`, message: null }
      for (const message of session.messages) {
        if (message.line > line) break
        found = {
          title: `${date} · ${message.role === 'user' ? '我的记录' : message.role === 'ai' ? 'AI 的回复' : '记录'}`,
          message,
        }
      }
    }
    return found
  }
  const hunks = ranges.map(({ start, end }, id): ReviewHunk => {
    const chunk = rows.slice(start, end)
    const oldLocations = chunk
      .filter((row) => row.kind === 'removed')
      .map((row) => locate(oldDoc, row.beforeLine))
    const newLocations = chunk
      .filter((row) => row.kind === 'added')
      .map((row) => locate(newDoc, row.afterLine))
    const titles = [
      ...new Set(
        [...newLocations, ...oldLocations].map((location) => location?.title ?? '日记信息'),
      ),
    ]
    const oldAffected = new Set(
      oldLocations.flatMap((location) => (location?.message ? [location.message] : [])),
    )
    const newAffected = new Set(
      newLocations.flatMap((location) => (location?.message ? [location.message] : [])),
    )
    const pairs = new Map<Message, Message>()
    const oldMessages = oldDoc.sessions.flatMap((session) => session.messages)
    const newMessages = newDoc.sessions.flatMap((session) => session.messages)
    // 一个区块可能覆盖多条记录：先按明确 ID 对齐，再借助未变的上下文对齐手写记录。
    for (const message of newMessages) {
      if (!message.id) continue
      const candidates = oldMessages.filter((old) => old.id === message.id)
      if (candidates.length === 1 && (newAffected.has(message) || oldAffected.has(candidates[0]!)))
        pairs.set(message, candidates[0]!)
    }
    for (const row of chunk) {
      if (row.kind !== 'context' || !row.text.trim()) continue
      const old = locate(oldDoc, row.beforeLine)?.message
      const next = locate(newDoc, row.afterLine)?.message
      if (
        old &&
        next &&
        (!old.id || !next.id || old.id === next.id) &&
        !pairs.has(next) &&
        (oldAffected.has(old) || newAffected.has(next))
      )
        pairs.set(next, old)
    }
    const fields = new Set<string>()
    for (const [next, old] of pairs) {
      for (const [key, label] of Object.entries(FIELD_NAMES)) {
        if (JSON.stringify(fieldValue(old, key)) !== JSON.stringify(fieldValue(next, key)))
          fields.add(label)
      }
    }
    // 无法确定新增/删除记录的对应关系时，使用完整的行数摘要，不把局部字段当成全部改动。
    if (
      [...oldAffected].some((message) => ![...pairs.values()].includes(message)) ||
      [...newAffected].some((message) => !pairs.has(message)) ||
      [...oldLocations, ...newLocations].some((location) => !location?.message)
    )
      fields.clear()
    return {
      id,
      title: titles.slice(0, 3).join(' / ') + (titles.length > 3 ? ` 等 ${titles.length} 处` : ''),
      fields: [...fields],
      rows: chunk,
      beforeStart: chunk.find((row) => row.beforeLine !== null)?.beforeLine ?? null,
      afterStart: chunk.find((row) => row.afterLine !== null)?.afterLine ?? null,
      hiddenBefore: start - (ranges[id - 1]?.end ?? 0),
    }
  })
  return { added, removed, hunks, rows, hiddenAfter: rows.length - (ranges.at(-1)?.end ?? 0) }
}

export function describeChange(review: ChangeReview) {
  const fields = [...new Set(review.hunks.flatMap((hunk) => hunk.fields))]
  return fields.length && review.hunks.every((hunk) => hunk.fields.length > 0)
    ? fields.join('、')
    : `${review.hunks.length} 处改动 · +${review.added} / −${review.removed} 行`
}

/** 并排视图按连续替换块配对，新增/删除不挤到另一条记录的旁边。 */
export function pairReviewLines(
  rows: ReviewLine[],
): { before: ReviewLine | null; after: ReviewLine | null }[] {
  const pairs: { before: ReviewLine | null; after: ReviewLine | null }[] = []
  for (let i = 0; i < rows.length;) {
    const row = rows[i]!
    if (row.kind === 'context') {
      pairs.push({ before: row, after: row })
      i++
      continue
    }
    const oldRows: ReviewLine[] = []
    const newRows: ReviewLine[] = []
    while (rows[i] && rows[i]!.kind !== 'context') {
      const changed = rows[i++]!
      if (changed.kind === 'removed') oldRows.push(changed)
      else newRows.push(changed)
    }
    for (let p = 0; p < Math.max(oldRows.length, newRows.length); p++)
      pairs.push({ before: oldRows[p] ?? null, after: newRows[p] ?? null })
  }
  return pairs
}
