import type { DerivedMessage } from '../model/derive'
import type { Message } from '../parser/types'

export type ReplacementScope = 'body' | 'reasoning' | 'commentary' | 'annotations' | 'tags' | 'model'
export interface ReplacementSettings { scopes: ReplacementScope[]; caseSensitive: boolean }
export interface ReplacementMatch {
  id: string
  messageId: string
  scope: ReplacementScope
  path: (string | number)[]
  text: string
  start: number
  end: number
  date: string | null
}
export interface MessageReplacement { id: string; message: Message }

function groupMatches(matches: ReplacementMatch[], keyOf: (match: ReplacementMatch) => string): Map<string, ReplacementMatch[]> {
  const groups = new Map<string, ReplacementMatch[]>()
  for (const match of matches) {
    const key = keyOf(match)
    const group = groups.get(key)
    if (group) group.push(match)
    else groups.set(key, [match])
  }
  return groups
}

export function findReplacementMatches(messages: DerivedMessage[], query: string, settings: ReplacementSettings): ReplacementMatch[] {
  if (!query) return []
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), settings.caseSensitive ? 'g' : 'gi')
  const result: ReplacementMatch[] = []
  for (const message of messages) {
    const targets: { scope: ReplacementScope; path: (string | number)[]; text: string }[] = []
    if (message.parts?.length) {
      message.parts.forEach((part, index) => {
        const scope = part.kind === 'answer' ? 'body' : part.kind === 'reasoning' ? 'reasoning' : part.kind === 'commentary' ? 'commentary' : null
        if (scope) targets.push({ scope, path: ['parts', index, 'text'], text: part.text ?? '' })
      })
    } else {
      targets.push({ scope: 'body', path: ['content'], text: message.content })
      if (message.thinking) targets.push({ scope: 'reasoning', path: ['thinking', 'text'], text: message.thinking.text })
    }
    message.annotations?.forEach((annotation, index) => targets.push({ scope: 'annotations', path: ['annotations', index, 'text'], text: annotation.text }))
    message.tags?.forEach((tag, index) => targets.push({ scope: 'tags', path: ['tags', index], text: tag }))
    if (message.modelInfo?.name) targets.push({ scope: 'model', path: ['modelInfo', 'name'], text: message.modelInfo.name })
    else if (message.model) targets.push({ scope: 'model', path: ['model'], text: message.model })
    if (message.modelInfo?.id) targets.push({ scope: 'model', path: ['modelInfo', 'id'], text: message.modelInfo.id })
    for (const target of targets) {
      if (!settings.scopes.includes(target.scope)) continue
      for (const match of target.text.matchAll(expression)) {
        const start = match.index!
        result.push({ id: `${message.id}:${target.path.join('.')}:${start}`, messageId: message.id, scope: target.scope, path: target.path, text: target.text, start, end: start + match[0].length, date: message.effectiveDate })
      }
    }
  }
  return result
}

/** 同一文本从右向左替换，保留其他命中的原始位置。 */
export function applyReplacementMatches(messages: DerivedMessage[], matches: ReplacementMatch[], replacement: string): MessageReplacement[] {
  const grouped = groupMatches(matches, (match) => match.messageId)
  return messages.filter((message) => grouped.has(message.id)).map((message) => {
    const updated: Message = structuredClone(message)
    const paths = groupMatches(grouped.get(message.id)!, (match) => JSON.stringify(match.path))
    for (const selected of paths.values()) {
      const first = selected[0]!
      let value = first.text
      for (const match of [...selected].sort((a, b) => b.start - a.start)) value = value.slice(0, match.start) + replacement + value.slice(match.end)
      let parent = updated as unknown as Record<string | number, unknown>
      for (const key of first.path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>
      parent[first.path.at(-1)!] = value
    }
    if (updated.parts?.length) {
      updated.content = updated.parts.filter((part) => part.kind === 'answer').map((part) => part.text ?? '').join('\n\n')
      const reasoning = updated.parts.find((part) => part.kind === 'reasoning')
      updated.thinking = reasoning ? { text: reasoning.text ?? '', label: String(reasoning.data?.label ?? '思考过程') } : null
    }
    if (updated.tags) updated.tags = [...new Set(updated.tags)].filter(Boolean)
    return { id: message.id, message: updated }
  })
}
