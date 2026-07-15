import { timeOfDay } from '../lib/format'

/** AI 消息头部的模型名小徽章 */
export function ModelChip({ model }: { model: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-px font-mono text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400">
      {model}
    </span>
  )
}

/**
 * 精度感知的时间显示：秒/分精度显示 HH:mm（title 给完整时间戳）；
 * 日精度不显示（日期分割线已有日期信息）。
 */
export function TimeChip({ time }: { time: string }) {
  const hm = timeOfDay(time)
  if (!hm) return null
  return (
    <time title={time} className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
      {hm}
    </time>
  )
}
