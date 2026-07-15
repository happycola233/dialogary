import type { DerivedDoc, DerivedMessage } from './derive'
import type { Role } from '../parser/types'

export interface SearchHit {
  id: string
  role: Role
  date: string | null
  time: string | null
  /** 命中片段（原文大小写），用于结果行高亮 */
  before: string
  match: string
  after: string
  inThinking: boolean
}

function searchable(m: DerivedMessage): { content: string; thinking: string } {
  return { content: m.content, thinking: m.thinking?.text ?? '' }
}

/**
 * 大小写不敏感的 substring 搜索（CJK 不需要分词，333 条 / ~1MB 即时完成）。
 * 命中正文优先于命中思考摘要。
 */
export function searchMessages(doc: DerivedDoc, query: string, limit = 200): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const m of doc.messages) {
    const { content, thinking } = searchable(m)
    let text = content
    let idx = content.toLowerCase().indexOf(q)
    let inThinking = false
    if (idx < 0 && thinking) {
      idx = thinking.toLowerCase().indexOf(q)
      text = thinking
      inThinking = true
    }
    if (idx < 0) continue
    hits.push({
      id: m.id,
      role: m.role,
      date: m.effectiveDate,
      time: m.time,
      before: (idx > 36 ? '…' : '') + text.slice(Math.max(0, idx - 36), idx),
      match: text.slice(idx, idx + q.length),
      after: text.slice(idx + q.length, idx + q.length + 60),
      inThinking,
    })
    if (hits.length >= limit) break
  }
  return hits
}
