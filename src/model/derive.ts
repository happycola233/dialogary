/** 解析结果的派生层：加载后一次算好、全程只读（不可变性是下游 memo 的基础） */
import { weekdayOf } from '../lib/format'
import { totalReasoningSeconds } from '../process/reasoningTiming'
import type { ChatDoc, LintIssue, Message, PersonalFields, Session } from '../parser/types'

export interface DerivedMessage extends Message {
  /** 优先使用档案中的稳定 ID；手写未编号消息只生成临时阅读锚点。 */
  id: string
  index: number
  sessionIndex: number
  /** 自身时间的日期部分，否则取所在日期节的日期 */
  effectiveDate: string | null
  /** §11 继承规则：无时间戳时向前继承最近的已知时间 */
  effectiveTime: string | null
  contentChars: number
  thinkingSeconds: number | null
  dayContext?: PersonalFields & { title: string | null }
}

export interface DerivedSession extends Omit<Session, 'messages'> {
  index: number
  messages: DerivedMessage[]
  weekday: string | null
  userCount: number
  aiCount: number
  charCount: number
}

export interface MonthGroup {
  ym: string
  sessions: DerivedSession[]
}

export interface DerivedDoc {
  format: string | null
  title: string
  timezone: string | null
  meta: Record<string, unknown>
  sessions: DerivedSession[]
  /** 扁平消息表（按文档顺序） */
  messages: DerivedMessage[]
  months: MonthGroup[]
  issues: LintIssue[]
}

export function deriveDoc(doc: ChatDoc, issues: LintIssue[]): DerivedDoc {
  const sessions: DerivedSession[] = []
  const flat: DerivedMessage[] = []
  let lastTime: string | null = null
  let index = 0
  const usedIds = new Map<string, number>()

  doc.sessions.forEach((s, si) => {
    const msgs: DerivedMessage[] = []
    let userCount = 0
    let aiCount = 0
    let charCount = 0
    for (const m of s.messages) {
      if (m.time) lastTime = m.time
      const baseId = m.id || `m${index}`
      const occurrence = (usedIds.get(baseId) ?? 0) + 1
      usedIds.set(baseId, occurrence)
      const dm: DerivedMessage = {
        ...m,
        id: occurrence === 1 ? baseId : `${baseId}--${occurrence}`,
        index,
        sessionIndex: si,
        effectiveDate: m.time ? m.time.slice(0, 10) : s.date,
        effectiveTime: m.time ?? lastTime,
        contentChars: m.content.length,
        thinkingSeconds: totalReasoningSeconds(m.parts, m.thinking, m.meta),
        dayContext: {
          title: s.title,
          tags: s.tags,
          mood: s.mood,
          states: s.states,
          starred: s.starred,
          annotations: s.annotations,
        },
      }
      index++
      msgs.push(dm)
      flat.push(dm)
      if (m.role === 'user') userCount++
      else if (m.role === 'ai') aiCount++
      charCount += m.content.length
    }
    sessions.push({
      ...s,
      index: si,
      date: s.date,
      title: s.title,
      meta: s.meta,
      line: s.line,
      weekday: s.date ? weekdayOf(s.date) : null,
      messages: msgs,
      userCount,
      aiCount,
      charCount,
    })
  })

  const months: MonthGroup[] = []
  for (const s of sessions) {
    const ym = s.date ? s.date.slice(0, 7) : '未标日期'
    const last = months[months.length - 1]
    if (last && last.ym === ym) last.sessions.push(s)
    else months.push({ ym, sessions: [s] })
  }

  return {
    format: doc.format,
    title: typeof doc.meta['title'] === 'string' ? doc.meta['title'] : '聊天记录',
    timezone: typeof doc.meta['timezone'] === 'string' ? doc.meta['timezone'] : null,
    meta: doc.meta,
    sessions,
    messages: flat,
    months,
    issues,
  }
}
