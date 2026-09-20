import { parseThinkingSeconds } from '../lib/format'
import type { Metadata, Thinking } from '../parser/types'

type TimedPart = { kind: string; data?: unknown }

function durationSeconds(milliseconds: unknown): number | null {
  return typeof milliseconds === 'number' && Number.isFinite(milliseconds) && milliseconds >= 0
    ? milliseconds / 1000
    : null
}

export function reasoningSeconds(part: TimedPart): number | null {
  if (part.kind !== 'reasoning' || !part.data || typeof part.data !== 'object') return null
  const data = part.data as Record<string, unknown>
  const seconds = durationSeconds(data.duration_ms)
  if (seconds !== null) return seconds
  return typeof data.label === 'string' ? parseThinkingSeconds(data.label) : null
}

/** 优先使用消息记录的整轮时长；否则仅在每段时长完整时汇总，不把缺失当成零秒。 */
export function totalReasoningSeconds(
  parts: TimedPart[] = [],
  thinking?: Thinking | null,
  meta?: Metadata,
): number | null {
  const generation = meta?.['x-generation']
  const recorded =
    generation && typeof generation === 'object'
      ? durationSeconds((generation as Metadata).reasoning_duration_ms)
      : null
  if (recorded !== null) return recorded
  const reasoning = parts.filter((part) => part.kind === 'reasoning')
  if (!reasoning.length) return thinking ? parseThinkingSeconds(thinking.label) : null
  const seconds = reasoning.map(reasoningSeconds)
  if (seconds.every((value) => value !== null))
    return seconds.reduce<number>((sum, value) => sum + value!, 0)
  // 兼容仅保存一段思考、时长放在旧字段里的历史记录。
  return reasoning.length === 1 && thinking ? parseThinkingSeconds(thinking.label) : null
}

export function reasoningLabel(
  parts: TimedPart[],
  thinking?: Thinking | null,
  recordedTotalSeconds?: number | null,
): string {
  const seconds = recordedTotalSeconds ?? totalReasoningSeconds(parts, thinking)
  if (seconds !== null) return `已思考 ${Math.floor(seconds)}s`
  if (parts.filter((part) => part.kind === 'reasoning').length > 1) return '思考过程'
  const first = parts.find((part) => part.kind === 'reasoning')
  const data = first?.data as Record<string, unknown> | undefined
  return (typeof data?.label === 'string' && data.label.trim()) || thinking?.label || '思考过程'
}
