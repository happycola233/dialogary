import type { Message, MessagePart, TimePrecision } from '../parser/types'

/**
 * original 仅供调用方定位；完整 Message 保留未知字段与原始片段。
 * date 是记录所在日期节（`# @日期`），决定记录显示在哪一天；time 是消息头里的原始时间。
 */
export interface MessageDraft extends Message {
  original?: Message
  date: string
}

/** date 必须取记录所在的日期节，不能用消息时间推断：跨日记录的两者可以不同。 */
export function createMessageDraft(message: Message | null, date: string): MessageDraft {
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
    date,
  }
}

export function timePrecisionOf(value: string | null): TimePrecision {
  return !value ? null : value.length <= 10 ? 'day' : value.length <= 16 ? 'minute' : 'second'
}

/** 消息时间中的时刻（HH:mm 或 HH:mm:ss）；没有时间或只记到日期时为空。 */
export function clockOf(time: string | null): string {
  return time && time.length > 10 ? time.slice(11) : ''
}

/**
 * 只替换时刻，保留时间自身的日期：零点后继续的对话可以记在前一天的日期节里。
 * 清空时刻时，原本只记到日期的时间保留日期，其余视为未记录时间。
 */
export function withClock(
  time: string | null,
  date: string,
  clock: string,
  keepDay: boolean,
): string | null {
  const day = time?.slice(0, 10) || date
  return clock ? `${day} ${clock}` : keepDay ? day : null
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

/** AI 回复中先于正文发生的过程块。 */
export const PROCESS_KINDS = ['reasoning', 'commentary', 'search']

/** 通常先写好正文再补过程：新的思考、说明与检索放在第一段正文之前，正文和其他内容追加到末尾。 */
export function insertionIndex(parts: MessagePart[], kind: string): number {
  if (!PROCESS_KINDS.includes(kind)) return parts.length
  const firstAnswer = parts.findIndex((part) => part.kind === 'answer')
  return firstAnswer < 0 ? parts.length : firstAnswer
}
