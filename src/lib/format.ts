/** 日期/时长格式化工具 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export function weekdayOf(date: string): string | null {
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : WEEKDAYS[d.getDay()]!
}

/** '2025-03-28' → '2025年3月28日' */
export function formatDateCn(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${y}年${Number(m)}月${Number(d)}日`
}

/** '2025-03' → '2025年3月' */
export function formatMonthCn(ym: string): string {
  const [y, m] = ym.split('-')
  if (!y || !m) return ym
  return `${y}年${Number(m)}月`
}

/** 'YYYY-MM-DD HH:mm[:ss]' → 'HH:mm'；日精度返回 null */
export function timeOfDay(time: string): string | null {
  return time.length > 10 ? time.slice(11, 16) : null
}

/**
 * 从思考块 label（通常「已思考 1m 24s」）提取总秒数；容忍自由文本（如「已思考若干秒」）→ null。
 */
export function parseThinkingSeconds(label: string): number | null {
  let total = 0
  let found = false
  const h = /(\d+)\s*h/.exec(label)
  const m = /(\d+)\s*m(?!s)/.exec(label)
  const s = /(\d+)\s*s/.exec(label)
  if (h) (total += Number(h[1]) * 3600), (found = true)
  if (m) (total += Number(m[1]) * 60), (found = true)
  if (s) (total += Number(s[1])), (found = true)
  return found ? total : null
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }
  const hh = Math.floor(seconds / 3600)
  const mm = Math.round((seconds % 3600) / 60)
  return mm ? `${hh}h ${mm}m` : `${hh}h`
}
