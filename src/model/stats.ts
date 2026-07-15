/** 统计页数据集：加载后一次预计算（组件内不做遍历） */
import type { DerivedDoc } from './derive'

export interface MonthlyRow {
  ym: string
  user: number
  ai: number
}

export interface DayCell {
  date: string
  count: number
}

export interface ModelRow {
  model: string
  count: number
  firstDate: string | null
  lastDate: string | null
}

export interface LengthBucket {
  label: string
  user: number
  ai: number
}

export interface TopDay {
  date: string
  title: string | null
  count: number
  firstMsgId: string
}

export interface Stats {
  sessions: number
  messages: number
  userCount: number
  aiCount: number
  userChars: number
  aiChars: number
  thinkingCount: number
  thinkingTotalSeconds: number
  attachments: number
  firstDate: string | null
  lastDate: string | null
  spanDays: number
  activeDays: number
  longestStreak: number
  monthly: MonthlyRow[]
  /** 按年分组的日历热力数据 */
  calendar: { year: string; days: DayCell[]; max: number }[]
  hourHist: { hour: number; count: number }[]
  models: ModelRow[]
  lengthDist: LengthBucket[]
  topDays: TopDay[]
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

const LENGTH_BUCKETS = [
  { label: '≤50', max: 50 },
  { label: '50–200', max: 200 },
  { label: '200–500', max: 500 },
  { label: '500–1k', max: 1000 },
  { label: '1k–2k', max: 2000 },
  { label: '>2k', max: Infinity },
] as const

export function computeStats(doc: DerivedDoc): Stats {
  const msgs = doc.messages
  let userCount = 0
  let aiCount = 0
  let userChars = 0
  let aiChars = 0
  let thinkingCount = 0
  let thinkingTotalSeconds = 0
  let attachments = 0

  const monthMap = new Map<string, MonthlyRow>()
  const dayMap = new Map<string, number>()
  const hourHist = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  const modelMap = new Map<string, ModelRow>()
  const lengthDist: LengthBucket[] = LENGTH_BUCKETS.map((b) => ({ label: b.label, user: 0, ai: 0 }))

  for (const m of msgs) {
    if (m.role === 'user') {
      userCount++
      userChars += m.contentChars
    } else {
      aiCount++
      aiChars += m.contentChars
    }
    if (m.thinking) {
      thinkingCount++
      thinkingTotalSeconds += m.thinkingSeconds ?? 0
    }
    attachments += m.attachments.length

    const date = m.effectiveDate
    if (date) {
      dayMap.set(date, (dayMap.get(date) ?? 0) + 1)
      const ym = date.slice(0, 7)
      let row = monthMap.get(ym)
      if (!row) {
        row = { ym, user: 0, ai: 0 }
        monthMap.set(ym, row)
      }
      if (m.role === 'user') row.user++
      else row.ai++
    }

    // 时段分布只统计有时分精度的消息
    if (m.time && m.time.length > 10) hourHist[Number(m.time.slice(11, 13))]!.count++

    if (m.model) {
      let row = modelMap.get(m.model)
      if (!row) {
        row = { model: m.model, count: 0, firstDate: null, lastDate: null }
        modelMap.set(m.model, row)
      }
      row.count++
      if (date) {
        row.firstDate ??= date
        row.lastDate = date
      }
    }

    const bucket = lengthDist[LENGTH_BUCKETS.findIndex((b) => m.contentChars <= b.max)]!
    if (m.role === 'user') bucket.user++
    else bucket.ai++
  }

  const dates = [...dayMap.keys()].sort()
  const firstDate = dates[0] ?? null
  const lastDate = dates[dates.length - 1] ?? null

  // 补齐区间内的空月份，时间轴保持连续
  const monthly: MonthlyRow[] = []
  if (firstDate && lastDate) {
    let ym = firstDate.slice(0, 7)
    const end = lastDate.slice(0, 7)
    while (ym <= end) {
      monthly.push(monthMap.get(ym) ?? { ym, user: 0, ai: 0 })
      ym = addMonths(ym, 1)
    }
  }

  // 最长连续记录天数
  let longestStreak = 0
  let streak = 0
  for (let i = 0; i < dates.length; i++) {
    streak = i > 0 && dayDiff(dates[i - 1]!, dates[i]!) === 1 ? streak + 1 : 1
    longestStreak = Math.max(longestStreak, streak)
  }

  // 按年分组的日历（每年从 1/1 到 12/31，仅覆盖有数据的年份）
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))]
  const calendar = years.map((year) => {
    const days: DayCell[] = []
    let max = 0
    const start = new Date(`${year}-01-01T00:00:00Z`)
    for (let d = new Date(start); d.getUTCFullYear() === Number(year); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10)
      const count = dayMap.get(iso) ?? 0
      max = Math.max(max, count)
      days.push({ date: iso, count })
    }
    return { year, days, max }
  })

  const topDays = doc.sessions
    .filter((s) => s.date && s.messages.length > 0)
    .map((s) => ({
      date: s.date!,
      title: s.title,
      count: s.messages.length,
      firstMsgId: s.messages[0]!.id,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    sessions: doc.sessions.length,
    messages: msgs.length,
    userCount,
    aiCount,
    userChars,
    aiChars,
    thinkingCount,
    thinkingTotalSeconds,
    attachments,
    firstDate,
    lastDate,
    spanDays: firstDate && lastDate ? dayDiff(firstDate, lastDate) + 1 : 0,
    activeDays: dates.length,
    longestStreak,
    monthly,
    calendar,
    hourHist,
    models: [...modelMap.values()].sort((a, b) => b.count - a.count),
    lengthDist,
    topDays,
  }
}
