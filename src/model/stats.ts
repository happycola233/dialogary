import type { DerivedDoc, DerivedMessage } from './derive'

export interface StatsFilter {
  from?: string
  to?: string
  role?: string
  model?: string
  tag?: string
  mood?: string
  state?: string
  effort?: string
  hour?: number
}
export const TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'reasoning_tokens',
  'total_tokens',
] as const
export type TokenField = (typeof TOKEN_FIELDS)[number]
export interface TokenMetric {
  total: number
  recorded: number
}
export interface FacetRow {
  label: string
  count: number
}
export interface MonthlyRow {
  ym: string
  user: number
  ai: number
  input: number
  output: number
  usageRecorded: number
  tokenTotals: Partial<Record<TokenField, number>>
}
export interface DayCell {
  date: string
  count: number
  userChars: number
  firstMsgId?: string
}
export interface ModelRow {
  model: string
  name: string
  count: number
  firstDate: string | null
  lastDate: string | null
  input: number
  output: number
  usageRecorded: number
}
export interface TopDay {
  date: string
  count: number
  firstMsgId: string
  userChars: number
}
export interface Stats {
  sessions: number
  messages: number
  userCount: number
  aiCount: number
  systemCount: number
  userChars: number
  aiChars: number
  thinkingChars: number
  commentaryChars: number
  annotationChars: number
  annotationCount: number
  starred: number
  thinkingCount: number
  thinkingTotalSeconds: number
  thinkingDurationRecorded: number
  attachments: number
  firstDate: string | null
  lastDate: string | null
  spanDays: number
  activeDays: number
  longestStreak: number
  monthly: MonthlyRow[]
  daily: DayCell[]
  calendar: { year: string; days: DayCell[]; max: number }[]
  hourHist: { hour: number; count: number }[]
  timedMessages: number
  models: ModelRow[]
  tags: FacetRow[]
  moods: FacetRow[]
  states: FacetRow[]
  efforts: FacetRow[]
  lengthDist: { label: string; user: number; ai: number }[]
  topDays: TopDay[]
  tokens: Record<TokenField, TokenMetric>
  usageRecorded: number
  cacheHitRate: number | null
  cacheComparableMessages: number
}

export const countChars = (text: string) => Array.from(text).length
export const modelKey = (message: DerivedMessage) =>
  message.modelInfo?.id || message.modelInfo?.name || message.model || ''
export const modelName = (message: DerivedMessage) =>
  message.modelInfo?.name || message.modelInfo?.id || message.model || ''

/** 日期级整理信息只在查询和统计时合并，不写回各条消息，避免隐式扩散。 */
export function messageFacets(doc: DerivedDoc, message: DerivedMessage) {
  const session = doc.sessions[message.sessionIndex]
  return {
    tags: [...new Set([...(session?.tags ?? []), ...(message.tags ?? [])])],
    mood: message.mood || session?.mood || '',
    states: [...new Set([...(session?.states ?? []), ...(message.states ?? [])])],
  }
}

export function filterStatsMessages(doc: DerivedDoc, filter: StatsFilter = {}): DerivedMessage[] {
  return doc.messages.filter((message) => {
    if (filter.from && (!message.effectiveDate || message.effectiveDate < filter.from)) return false
    if (filter.to && (!message.effectiveDate || message.effectiveDate > filter.to)) return false
    if (filter.role && filter.role !== 'all' && message.role !== filter.role) return false
    if (filter.model && modelKey(message) !== filter.model) return false
    if (filter.effort && message.modelInfo?.reasoningEffort !== filter.effort) return false
    if (
      filter.hour !== undefined &&
      (!message.time || message.time.length <= 10 || Number(message.time.slice(11, 13)) !== filter.hour)
    )
      return false
    const facets = messageFacets(doc, message)
    return (
      (!filter.tag || facets.tags.includes(filter.tag)) &&
      (!filter.mood || facets.mood === filter.mood) &&
      (!filter.state || facets.states.includes(filter.state))
    )
  })
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
export function shiftDay(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function previousPeriod(filter: StatsFilter): StatsFilter | null {
  if (!filter.from || !filter.to || filter.to < filter.from) return null
  const length = dayDiff(filter.from, filter.to) + 1
  return {
    ...filter,
    from: shiftDay(filter.from, -length),
    to: shiftDay(filter.from, -1),
  }
}
const LENGTH_BUCKETS = [
  { label: '≤50', max: 50 },
  { label: '51–200', max: 200 },
  { label: '201–500', max: 500 },
  { label: '501–1千', max: 1000 },
  { label: '1千–2千', max: 2000 },
  { label: '>2千', max: Infinity },
]
const addFacet = (map: Map<string, number>, value: string) => {
  if (value) map.set(value, (map.get(value) ?? 0) + 1)
}
const facetRows = (map: Map<string, number>): FacetRow[] =>
  [...map]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'))

export function computeStats(doc: DerivedDoc, filter: StatsFilter = {}): Stats {
  const messages = filterStatsMessages(doc, filter)
  const tokens = Object.fromEntries(TOKEN_FIELDS.map((key) => [key, { total: 0, recorded: 0 }])) as Record<
    TokenField,
    TokenMetric
  >
  const stats: Stats = {
    sessions: new Set(messages.map((message) => message.sessionIndex)).size,
    messages: messages.length,
    userCount: 0,
    aiCount: 0,
    systemCount: 0,
    userChars: 0,
    aiChars: 0,
    thinkingChars: 0,
    commentaryChars: 0,
    annotationChars: 0,
    annotationCount: 0,
    starred: 0,
    thinkingCount: 0,
    thinkingTotalSeconds: 0,
    thinkingDurationRecorded: 0,
    attachments: 0,
    firstDate: null,
    lastDate: null,
    spanDays: 0,
    activeDays: 0,
    longestStreak: 0,
    monthly: [],
    daily: [],
    calendar: [],
    hourHist: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    timedMessages: 0,
    models: [],
    tags: [],
    moods: [],
    states: [],
    efforts: [],
    lengthDist: LENGTH_BUCKETS.map(({ label }) => ({ label, user: 0, ai: 0 })),
    topDays: [],
    tokens,
    usageRecorded: 0,
    cacheHitRate: null,
    cacheComparableMessages: 0,
  }
  const months = new Map<string, MonthlyRow>(),
    days = new Map<string, DayCell>(),
    models = new Map<string, ModelRow>()
  const tags = new Map<string, number>(),
    moods = new Map<string, number>(),
    states = new Map<string, number>(),
    efforts = new Map<string, number>()
  let cacheComparableInput = 0,
    cacheComparableRead = 0
  const seenSessions = new Set<number>()
  for (const message of messages) {
    const chars = countChars(message.content)
    if (message.role === 'user') {
      stats.userCount++
      stats.userChars += chars
    } else if (message.role === 'ai') {
      stats.aiCount++
      stats.aiChars += chars
    } else stats.systemCount++
    const reasoning = message.parts?.filter((part) => part.kind === 'reasoning') ?? []
    if (reasoning.length || message.thinking || message.thinkingSeconds !== null) {
      stats.thinkingCount++
      stats.thinkingChars += reasoning.length
        ? reasoning.reduce((sum, part) => sum + countChars(part.text ?? ''), 0)
        : countChars(message.thinking?.text ?? '')
      if (message.thinkingSeconds !== null) {
        stats.thinkingTotalSeconds += message.thinkingSeconds
        stats.thinkingDurationRecorded++
      }
    }
    stats.commentaryChars += (message.parts ?? [])
      .filter((part) => part.kind === 'commentary')
      .reduce((sum, part) => sum + countChars(part.text ?? ''), 0)
    const annotations = [...(message.annotations ?? [])]
    if (!seenSessions.has(message.sessionIndex)) {
      seenSessions.add(message.sessionIndex)
      annotations.push(...(doc.sessions[message.sessionIndex]?.annotations ?? []))
    }
    stats.annotationCount += annotations.length
    stats.annotationChars += annotations.reduce((sum, annotation) => sum + countChars(annotation.text), 0)
    if (message.starred) stats.starred++
    stats.attachments += message.attachments.length
    const facets = messageFacets(doc, message)
    facets.tags.forEach((tag) => addFacet(tags, tag))
    facets.states.forEach((state) => addFacet(states, state))
    addFacet(moods, facets.mood)
    addFacet(efforts, message.modelInfo?.reasoningEffort ?? '')
    const date = message.effectiveDate
    let month: MonthlyRow | undefined
    if (date) {
      const day = days.get(date) ?? {
        date,
        count: 0,
        userChars: 0,
        firstMsgId: message.id,
      }
      day.count++
      if (message.role === 'user') day.userChars += chars
      days.set(date, day)
      const ym = date.slice(0, 7)
      month = months.get(ym) ?? {
        ym,
        user: 0,
        ai: 0,
        input: 0,
        output: 0,
        usageRecorded: 0,
        tokenTotals: {},
      }
      if (message.role === 'user') month.user++
      if (message.role === 'ai') month.ai++
      months.set(ym, month)
    }
    // 只统计本条明确记录的时分，不使用向前继承的时间。
    if (message.time && message.time.length > 10) {
      stats.hourHist[Number(message.time.slice(11, 13))]!.count++
      stats.timedMessages++
    }
    let model: ModelRow | undefined
    const key = modelKey(message)
    if (key) {
      model = models.get(key) ?? {
        model: key,
        name: modelName(message),
        count: 0,
        firstDate: null,
        lastDate: null,
        input: 0,
        output: 0,
        usageRecorded: 0,
      }
      model.count++
      if (date) {
        if (!model.firstDate || date < model.firstDate) model.firstDate = date
        if (!model.lastDate || date > model.lastDate) model.lastDate = date
      }
      models.set(key, model)
    }
    if (message.role !== 'system')
      stats.lengthDist[LENGTH_BUCKETS.findIndex((bucket) => chars <= bucket.max)]![message.role]++
    const usage = message.role === 'ai' ? message.usage : undefined
    if (usage && TOKEN_FIELDS.some((field) => usage[field] !== undefined)) {
      stats.usageRecorded++
      for (const field of TOKEN_FIELDS) {
        // 输入已含缓存，输出已含推理；总量只能是输入 + 输出，不能再次加明细。
        const value =
          field === 'total_tokens' && usage.input_tokens !== undefined && usage.output_tokens !== undefined
            ? usage.input_tokens + usage.output_tokens
            : usage[field]
        if (typeof value === 'number') {
          tokens[field].total += value
          tokens[field].recorded++
          if (month) month.tokenTotals[field] = (month.tokenTotals[field] ?? 0) + value
        }
      }
      if (usage.input_tokens !== undefined && usage.cache_read_tokens !== undefined) {
        cacheComparableInput += usage.input_tokens
        cacheComparableRead += usage.cache_read_tokens
        stats.cacheComparableMessages++
      }
      for (const row of [month, model])
        if (row) {
          row.input += usage.input_tokens ?? 0
          row.output += usage.output_tokens ?? 0
          row.usageRecorded++
        }
    }
  }
  const dates = [...days.keys()].sort()
  stats.firstDate = dates[0] ?? null
  stats.lastDate = dates.at(-1) ?? null
  stats.spanDays = stats.firstDate && stats.lastDate ? dayDiff(stats.firstDate, stats.lastDate) + 1 : 0
  stats.activeDays = dates.length
  stats.daily = dates.map((date) => days.get(date)!)
  let streak = 0
  dates.forEach((date, index) => {
    streak = index > 0 && dayDiff(dates[index - 1]!, date) === 1 ? streak + 1 : 1
    stats.longestStreak = Math.max(stats.longestStreak, streak)
  })
  if (stats.firstDate && stats.lastDate) {
    const cursor = new Date(`${stats.firstDate.slice(0, 7)}-01T00:00:00Z`)
    while (cursor.toISOString().slice(0, 7) <= stats.lastDate.slice(0, 7)) {
      const ym = cursor.toISOString().slice(0, 7)
      stats.monthly.push(
        months.get(ym) ?? {
          ym,
          user: 0,
          ai: 0,
          input: 0,
          output: 0,
          usageRecorded: 0,
          tokenTotals: {},
        },
      )
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  stats.calendar = [...new Set(dates.map((date) => date.slice(0, 4)))].map((year) => {
    const cells: DayCell[] = [],
      cursor = new Date(`${year}-01-01T00:00:00Z`)
    while (cursor.getUTCFullYear() === Number(year)) {
      const date = cursor.toISOString().slice(0, 10)
      cells.push(days.get(date) ?? { date, count: 0, userChars: 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return {
      year,
      days: cells,
      max: Math.max(...cells.map((cell) => cell.count)),
    }
  })
  stats.models = [...models.values()].sort((a, b) => b.count - a.count)
  stats.tags = facetRows(tags)
  stats.moods = facetRows(moods)
  stats.states = facetRows(states)
  stats.efforts = facetRows(efforts)
  stats.topDays = stats.daily
    .filter((day): day is TopDay => Boolean(day.firstMsgId))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  stats.cacheHitRate = cacheComparableInput > 0 ? cacheComparableRead / cacheComparableInput : null
  return stats
}
