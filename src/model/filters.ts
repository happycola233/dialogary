import type { DerivedMessage } from './derive'

export interface JournalFilters {
  query: string
  from: string
  to: string
  model: string
  tag: string
  mood: string
  state: string
  starred: boolean
  annotated: boolean
  hasAttachment: boolean
}

export const EMPTY_FILTERS: JournalFilters = {
  query: '',
  from: '',
  to: '',
  model: '',
  tag: '',
  mood: '',
  state: '',
  starred: false,
  annotated: false,
  hasAttachment: false,
}

export interface SavedView {
  id: string
  name: string
  filters: JournalFilters
  role: 'all' | 'user' | 'ai'
  readMode: 'conversation' | 'diary'
}

export function searchableText(message: DerivedMessage): string {
  return [
    message.content,
    message.thinking?.text,
    ...(message.parts ?? []).map(
      (part) =>
        `${part.text ?? ''} ${part.kind === 'search' ? JSON.stringify(part.data ?? {}) : ''}`,
    ),
    ...(message.annotations ?? []).map((note) => `${note.text} ${note.quote ?? ''}`),
    ...(message.tags ?? []),
    message.mood,
    ...(message.states ?? []),
    message.model,
    message.modelInfo?.id,
    message.modelInfo?.name,
    message.modelInfo?.reasoningEffort,
    ...message.attachments.map((attachment) => attachment.name),
    message.dayContext?.title,
    ...(message.dayContext?.tags ?? []),
    message.dayContext?.mood,
    ...(message.dayContext?.states ?? []),
    ...(message.dayContext?.annotations ?? []).map((note) => `${note.text} ${note.quote ?? ''}`),
  ]
    .filter(Boolean)
    .join('\n')
}

export function matchesFilters(message: DerivedMessage, filters: JournalFilters): boolean {
  if (filters.from && (!message.effectiveDate || message.effectiveDate < filters.from)) return false
  if (filters.to && (!message.effectiveDate || message.effectiveDate > filters.to)) return false
  if (
    filters.model &&
    ![message.model, message.modelInfo?.id, message.modelInfo?.name].includes(filters.model)
  )
    return false
  if (
    filters.tag &&
    !message.tags?.includes(filters.tag) &&
    !message.dayContext?.tags?.includes(filters.tag)
  )
    return false
  if (filters.mood && message.mood !== filters.mood && message.dayContext?.mood !== filters.mood)
    return false
  if (
    filters.state &&
    !message.states?.includes(filters.state) &&
    !message.dayContext?.states?.includes(filters.state)
  )
    return false
  if (filters.starred && !message.starred && !message.dayContext?.starred) return false
  if (filters.annotated && !message.annotations?.length && !message.dayContext?.annotations?.length)
    return false
  if (filters.hasAttachment && !message.attachments.length) return false
  return (
    !filters.query ||
    searchableText(message).toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())
  )
}

export function hasFilters(filters: JournalFilters): boolean {
  return Object.values(filters).some(Boolean)
}
