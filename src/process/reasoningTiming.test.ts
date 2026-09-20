import { describe, expect, it } from 'vitest'
import { parseThinkingSeconds } from '../lib/format'
import { reasoningLabel, totalReasoningSeconds } from './reasoningTiming'

describe('记录中的思考时长', () => {
  it('同时识别旧版时分秒与中文标题，不把毫秒误作分钟', () => {
    expect(parseThinkingSeconds('已思考 1m24s')).toBe(84)
    expect(parseThinkingSeconds('已思考 1小时 2分 3.5秒')).toBe(3723.5)
    expect(parseThinkingSeconds('已思考 300ms')).toBeNull()
  })
  it('优先使用结构化毫秒，显示与 HappyChat 一致的整数秒', () => {
    const parts = [{ kind: 'reasoning', data: { duration_ms: 2500, label: '已思考 9s' } }]
    expect(totalReasoningSeconds(parts)).toBe(2.5)
    expect(reasoningLabel(parts)).toBe('已思考 2s')
  })
  it('汇总完整过程时长，缺失数据不显示假的零秒或不完整总量', () => {
    const one = { kind: 'reasoning', data: { label: '已思考 30 秒' } }
    const two = { kind: 'reasoning', data: { duration_ms: 1000 } }
    expect(totalReasoningSeconds([one, two])).toBe(31)
    expect(totalReasoningSeconds([one, { kind: 'reasoning' }])).toBeNull()
    expect(reasoningLabel([one, { kind: 'reasoning' }])).toBe('思考过程')
    expect(reasoningLabel([{ kind: 'reasoning' }])).toBe('思考过程')
    expect(reasoningLabel([{ kind: 'reasoning', data: { duration_ms: 0 } }])).toBe('已思考 0s')
  })
})
