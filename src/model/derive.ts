/** 解析结果的派生层：加载后一次算好、全程只读（不可变性是下游 memo 的基础） */
import { parseThinkingSeconds, weekdayOf } from '../lib/format'
import type { ChatDoc, LintIssue, Message, Session } from '../parser/types'

export interface DerivedMessage extends Message {
  /** 'm' + 全局序号，兼作 DOM 锚点 id */
  id: string
  index: number
  sessionIndex: number
  /** 自身时间的日期部分，否则取所在日期节的日期 */
  effectiveDate: string | null
  /** §11 继承规则：无时间戳时向前继承最近的已知时间 */
  effectiveTime: string | null
  contentChars: number
  thinkingSeconds: number | null
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
  meta: Record<string, string>
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

  doc.sessions.forEach((s, si) => {
    const msgs: DerivedMessage[] = []
    let userCount = 0
    let aiCount = 0
    let charCount = 0
    for (const m of s.messages) {
      if (m.time) lastTime = m.time
      const dm: DerivedMessage = {
        ...m,
        id: `m${index}`,
        index,
        sessionIndex: si,
        effectiveDate: m.time ? m.time.slice(0, 10) : s.date,
        effectiveTime: m.time ?? lastTime,
        contentChars: m.content.length,
        thinkingSeconds: m.thinking ? parseThinkingSeconds(m.thinking.label) : null,
      }
      index++
      msgs.push(dm)
      flat.push(dm)
      if (m.role === 'user') userCount++
      else if (m.role === 'ai') aiCount++
      charCount += m.content.length
    }
    sessions.push({
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
    title: doc.meta['title'] ?? '聊天记录',
    timezone: doc.meta['timezone'] ?? null,
    meta: doc.meta,
    sessions,
    messages: flat,
    months,
    issues,
  }
}
