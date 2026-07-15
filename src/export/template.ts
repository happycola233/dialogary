/**
 * 导出模板：所有模板串支持 token 替换。
 * 可用 token：{content} {time} {date} {weekday} {timeOfDay} {model} {title}
 *            {thinkingLabel} {index}
 * 规则：某行引用的 token 全部缺值时整行折叠（不输出）。
 */
import { timeOfDay, weekdayOf } from '../lib/format'
import type { DerivedDoc, DerivedMessage, DerivedSession } from '../model/derive'

export interface RoleTemplate {
  include: boolean
  /** 每条消息的标题行，如 '# 🧑‍💻 User Prompt' */
  header: string
  /** 标题行之后的元信息（可多行），如 '> 时间：{time}' */
  metaLines: string
  includeThinking: boolean
  includeAttachments: boolean
}

export interface ExportTemplate {
  /** 日期节标题模板，空串 = 不输出 */
  sessionHeading: string
  /** 消息之间的分隔行，空串 = 仅空行 */
  separator: string
  user: RoleTemplate
  ai: RoleTemplate
}

export type ExportScope =
  | { kind: 'all' }
  | { kind: 'filtered'; role: 'user' | 'ai' }
  | { kind: 'range'; from: string; to: string }

const TOKEN_RE = /\{(content|time|date|weekday|timeOfDay|model|title|thinkingLabel|index)\}/g

function renderLine(tpl: string, values: Record<string, string | null>): string | null {
  let hasToken = false
  let allMissing = true
  const out = tpl.replace(TOKEN_RE, (_, key: string) => {
    hasToken = true
    const v = values[key]
    if (v) allMissing = false
    return v ?? ''
  })
  // 引用了 token 且全部缺值 → 整行折叠
  if (hasToken && allMissing) return null
  return out
}

function renderTemplate(tpl: string, values: Record<string, string | null>): string[] {
  const out: string[] = []
  for (const line of tpl.split('\n')) {
    const rendered = renderLine(line, values)
    if (rendered !== null) out.push(rendered)
  }
  return out
}

function messageValues(msg: DerivedMessage, session: DerivedSession, index: number): Record<string, string | null> {
  return {
    content: msg.content || null,
    time: msg.time,
    date: msg.effectiveDate,
    weekday: msg.effectiveDate ? weekdayOf(msg.effectiveDate) : null,
    timeOfDay: msg.time ? timeOfDay(msg.time) : null,
    model: msg.model,
    title: session.title,
    thinkingLabel: msg.thinking?.label ?? null,
    index: String(index + 1),
  }
}

export function renderExport(doc: DerivedDoc, template: ExportTemplate, scope: ExportScope): string {
  const blocks: string[] = []
  let index = 0

  for (const session of doc.sessions) {
    if (scope.kind === 'range') {
      if (!session.date || session.date < scope.from || session.date > scope.to) continue
    }
    const msgs = session.messages.filter((m) => {
      if (scope.kind === 'filtered' && m.role !== scope.role) return false
      const rt = m.role === 'user' ? template.user : template.ai
      return rt.include
    })
    if (msgs.length === 0) continue

    if (template.sessionHeading) {
      const heading = renderTemplate(template.sessionHeading, {
        date: session.date,
        weekday: session.weekday,
        title: session.title,
      })
      if (heading.length) blocks.push(heading.join('\n'))
    }

    for (const msg of msgs) {
      const rt = msg.role === 'user' ? template.user : template.ai
      const values = messageValues(msg, session, index)
      const parts: string[] = []

      if (rt.header) parts.push(...renderTemplate(rt.header, values))
      if (rt.metaLines.trim()) {
        const meta = renderTemplate(rt.metaLines, values)
        if (meta.length) parts.push(meta.join('\n'))
      }
      if (rt.includeThinking && msg.thinking) {
        const quoted = msg.thinking.text
          .split('\n')
          .map((l) => (l ? `> ${l}` : '>'))
          .join('\n')
        parts.push(`> 🤔 ${msg.thinking.label}\n>\n${quoted}`)
      }
      if (rt.includeAttachments && msg.attachments.length) {
        parts.push(
          msg.attachments
            .map((a) => {
              const icon = a.kind === 'image' ? '🖼️' : '📄'
              return a.path ? `${icon} [${a.name}](${a.path})` : `${icon} ${a.name}`
            })
            .join('\n'),
        )
      }
      if (msg.content) parts.push(msg.content)

      if (parts.length) blocks.push(parts.join('\n\n'))
      index++
    }
  }

  const sep = template.separator.trim() ? `\n\n${template.separator.trim()}\n\n` : '\n\n'
  return blocks.join(sep) + '\n'
}
