import { parseThinkingSeconds } from '../lib/format'
import type { Thinking } from '../parser/types'

type TimedPart = { kind: string; data?: unknown }

export function reasoningSeconds(part: TimedPart): number | null {
  if (part.kind !== 'reasoning' || !part.data || typeof part.data !== 'object') return null
  const data = part.data as Record<string, unknown>
  if (
    typeof data.duration_ms === 'number' &&
    Number.isFinite(data.duration_ms) &&
    data.duration_ms >= 0
  )
    return data.duration_ms / 1000
  return typeof data.label === 'string' ? parseThinkingSeconds(data.label) : null
}

/** 每段时长完整时才汇总，避免把没有记录时长的思考当作零秒。 */
export function totalReasoningSeconds(
  parts: TimedPart[] = [],
  thinking?: Thinking | null,
): number | null {
  const reasoning = parts.filter((part) => part.kind === 'reasoning')
  if (!reasoning.length) return thinking ? parseThinkingSeconds(thinking.label) : null
  const seconds = reasoning.map(reasoningSeconds)
  if (seconds.every((value) => value !== null))
    return seconds.reduce<number>((sum, value) => sum + value!, 0)
  // 兼容仅保存一段思考、时长放在旧字段里的历史记录。
  return reasoning.length === 1 && thinking ? parseThinkingSeconds(thinking.label) : null
}

export function reasoningLabel(parts: TimedPart[], thinking?: Thinking | null): string {
  const seconds = totalReasoningSeconds(parts, thinking)
  if (seconds !== null) return `已思考 ${Math.floor(seconds)}s`
  if (parts.filter((part) => part.kind === 'reasoning').length > 1) return '思考过程'
  const first = parts.find((part) => part.kind === 'reasoning')
  const data = first?.data as Record<string, unknown> | undefined
  return (typeof data?.label === 'string' && data.label.trim()) || thinking?.label || '思考过程'
}
