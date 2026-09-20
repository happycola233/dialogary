import type { Message, MessagePart, TimePrecision } from '../parser/types'

/** original 仅供调用方定位；完整 Message 保留未知字段与原始片段。 */
export interface MessageDraft extends Message {
  original?: Message
  date: string
}

export function createMessageDraft(message: Message | null, date?: string): MessageDraft {
  const today = new Date()
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const copy = structuredClone(message ?? {}) as Partial<Message> & Record<string, unknown>
  // 派生的阅读位置与统计不是文件内容，不能写入消息源码或持久化元数据。
  for (const key of [
    'index',
    'sessionIndex',
    'effectiveDate',
    'effectiveTime',
    'contentChars',
    'thinkingSeconds',
    'dayContext',
  ])
    delete copy[key]
  return {
    role: 'user',
    time: null,
    timePrecision: null,
    model: null,
    meta: {},
    thinking: null,
    attachments: [],
    content: '',
    line: 0,
    ...copy,
    original: message ?? undefined,
    date: date ?? (message ? (message.time?.slice(0, 10) ?? '') : localDate),
  }
}

export function timePrecisionOf(value: string | null): TimePrecision {
  return !value ? null : value.length <= 10 ? 'day' : value.length <= 16 ? 'minute' : 'second'
}

export function draftParts(draft: MessageDraft): MessagePart[] {
  if (draft.parts?.length) return draft.parts
  return [
    ...(draft.thinking
      ? [{ kind: 'reasoning', text: draft.thinking.text, data: { label: draft.thinking.label } }]
      : []),
    ...(draft.content ? [{ kind: 'answer', text: draft.content }] : []),
  ]
}

export function withParts(draft: MessageDraft, parts: MessagePart[]): MessageDraft {
  const previous = draftParts(draft)
  if (JSON.stringify(parts) === JSON.stringify(previous)) return draft
  const answerText = (values: MessagePart[]) =>
    values.filter((part) => part.kind === 'answer').map((part) => part.text ?? '')
  const answers = answerText(parts)
  const previousAnswers = answerText(previous)
  // 附件之间的正文在原文件中不一定用双换行分隔；只改过程信息时保留正文原貌。
  // 正文在编辑器内撤销回原内容时，也恢复原始间隔，避免产生虚假的文件差异。
  const content =
    JSON.stringify(answers) === JSON.stringify(previousAnswers)
      ? draft.content
      : draft.original &&
          JSON.stringify(answers) === JSON.stringify(answerText(draft.original.parts ?? []))
        ? draft.original.content
        : answers.join('\n\n')
  const reasoning = parts.filter((part) => part.kind === 'reasoning')
  return {
    ...draft,
    parts,
    content,
    thinking: reasoning.length
      ? { label: String(reasoning[0]?.data?.label ?? '思考过程'), text: reasoning[0]?.text ?? '' }
      : null,
  }
}
