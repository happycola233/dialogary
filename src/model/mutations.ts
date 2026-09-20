import type { ChatDoc, Message, Session } from '../parser/types'

export type MessageEdit = Partial<Message> & {
  date: string
  role: Message['role']
  content: string
}

export function messageAt(
  doc: ChatDoc,
  index: number,
): { session: Session; message: Message; position: number } {
  let offset = 0
  for (const session of doc.sessions) {
    if (index < offset + session.messages.length)
      return { session, message: session.messages[index - offset]!, position: index - offset }
    offset += session.messages.length
  }
  throw new Error('这条记录已发生变化，请重新打开')
}

export function ensureDay(doc: ChatDoc, date: string | null): Session {
  const existing = doc.sessions.find((session) => session.date === date)
  if (existing) return existing
  const section: Session = { date, title: null, meta: {}, messages: [], line: 0 }
  const next = date ? doc.sessions.findIndex((session) => session.date && session.date > date) : -1
  doc.sessions.splice(next < 0 ? doc.sessions.length : next, 0, section)
  return section
}

export function applyMessageEdit(
  doc: ChatDoc,
  draft: MessageEdit,
  index?: number,
  afterIndex?: number,
): string {
  const located = index === undefined ? undefined : messageAt(doc, index)
  const original = located?.message
  const {
    date,
    original: _original,
    index: _index,
    sessionIndex: _sessionIndex,
    effectiveDate: _effectiveDate,
    effectiveTime: _effectiveTime,
    contentChars: _contentChars,
    thinkingSeconds: _thinkingSeconds,
    dayContext: _dayContext,
    ...fields
  } = draft as MessageEdit & {
    original?: Message
    index?: number
    sessionIndex?: number
    effectiveDate?: string | null
    effectiveTime?: string | null
    contentChars?: number
    thinkingSeconds?: number | null
    dayContext?: unknown
  }
  const message: Message = {
    time: null,
    timePrecision: null,
    model: null,
    meta: {},
    thinking: null,
    attachments: [],
    line: 0,
    ...original,
    ...fields,
    id: original?.id || (original ? crypto.randomUUID() : fields.id || crypto.randomUUID()),
  }
  message.timePrecision = message.time
    ? message.time.length === 10
      ? 'day'
      : message.time.length === 16
        ? 'minute'
        : 'second'
    : null
  if (located && located.session.date === (date || null))
    located.session.messages[located.position] = message
  else {
    if (located) located.session.messages.splice(located.position, 1)
    const target = ensureDay(doc, date || null)
    const after = afterIndex === undefined ? undefined : messageAt(doc, afterIndex)
    const position = after?.session === target ? after.position + 1 : target.messages.length
    target.messages.splice(position, 0, message)
  }
  return message.id!
}

export interface BatchChange {
  addTags: string[]
  removeTags: string[]
  starred?: boolean
  mood?: string
  states?: string[]
  role?: Message['role']
  date?: string
}

/** 批量修改与移动在同一次提交里完成，索引始终基于修改前的文档。 */
export function applyBatchEdit(doc: ChatDoc, indices: number[], patch: BatchChange): void {
  const selected = new Set(indices.map((index) => messageAt(doc, index).message))
  for (const message of selected) {
    message.id ||= crypto.randomUUID()
    message.tags = [
      ...new Set([
        ...(message.tags ?? []).filter((tag) => !patch.removeTags.includes(tag)),
        ...patch.addTags,
      ]),
    ]
    if (patch.starred !== undefined) message.starred = patch.starred
    if (patch.mood !== undefined) message.mood = patch.mood
    if (patch.states !== undefined) message.states = patch.states
    if (patch.role !== undefined) message.role = patch.role
  }
  if (patch.date) {
    for (const section of doc.sessions)
      section.messages = section.messages.filter((message) => !selected.has(message))
    for (const message of selected)
      if (message.time) message.time = patch.date + message.time.slice(10)
    ensureDay(doc, patch.date).messages.push(...selected)
  }
}

export function omitPrivateSource(_key: string, value: unknown): unknown {
  if (_key === '_source') return undefined
  return value
}
