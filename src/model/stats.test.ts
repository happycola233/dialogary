import { describe, expect, it } from 'vitest'
import { deriveDoc } from './derive'
import { computeStats, filterStatsMessages, previousPeriod } from './stats'
import type { ChatDoc, Message, Session } from '../parser/types'

const message = (overrides: Partial<Message> = {}): Message => ({
  role: 'ai',
  time: null,
  timePrecision: null,
  model: null,
  meta: {},
  thinking: null,
  attachments: [],
  content: '',
  line: 1,
  ...overrides,
})
const session = (date: string, messages: Message[], overrides: Partial<Session> = {}): Session => ({
  date,
  title: null,
  meta: {},
  messages,
  line: 1,
  ...overrides,
})
const derive = (sessions: Session[]) =>
  deriveDoc({ format: 'chatlog-md/2', meta: {}, sessions, issues: [] } as ChatDoc, [])

describe('统计的用量口径', () => {
  it('输入包含缓存、输出包含推理，总量不重复相加', () => {
    const stats = computeStats(
      derive([
        session('2026-09-19', [
          message({
            usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cache_read_tokens: 600,
              cache_write_tokens: 100,
              reasoning_tokens: 50,
              total_tokens: 1200,
            },
          }),
        ]),
      ]),
    )
    expect(stats.tokens.total_tokens).toEqual({ total: 1200, recorded: 1 })
    expect(stats.tokens.input_tokens.total).toBe(1000)
    expect(stats.cacheHitRate).toBe(0.6)
  })
  it('缺失与零不同，缓存比例只使用同时记录输入和读取的消息', () => {
    const stats = computeStats(
      derive([
        session('2026-09-19', [
          message({ usage: { input_tokens: 1000, cache_read_tokens: 600 } }),
          message({ usage: { input_tokens: 9000 } }),
          message({ usage: { output_tokens: 0 } }),
          message(),
        ]),
      ]),
    )
    expect(stats.aiCount).toBe(4)
    expect(stats.usageRecorded).toBe(3)
    expect(stats.tokens.output_tokens).toEqual({ total: 0, recorded: 1 })
    expect(stats.tokens.cache_write_tokens).toEqual({ total: 0, recorded: 0 })
    expect(stats.tokens.total_tokens.recorded).toBe(0)
    expect(stats.cacheHitRate).toBe(0.6)
    expect(stats.cacheComparableMessages).toBe(1)
    expect(stats.monthly[0]!.tokenTotals.cache_write_tokens).toBeUndefined()
  })
})

describe('记录统计与筛选', () => {
  it('系统消息不算 AI，emoji 按 Unicode 字符计数，过程投影不会重复计算', () => {
    const stats = computeStats(
      derive([
        session(
          '2026-09-19',
          [
            message({
              role: 'user',
              content: '今天😊',
              annotations: [{ id: 'a', text: '记得' }],
            }),
            message({ role: 'system', content: '配置' }),
            message({
              content: '回复',
              thinking: { text: '想想', label: '已思考 3s' },
              parts: [
                { kind: 'reasoning', text: '想想' },
                { kind: 'commentary', text: '查找' },
                { kind: 'reasoning', text: '再想' },
              ],
            }),
          ],
          { annotations: [{ id: 'day-note', text: '一天' }] },
        ),
      ]),
    )
    expect(stats.userChars).toBe(3)
    expect(stats.aiCount).toBe(1)
    expect(stats.systemCount).toBe(1)
    expect(stats.thinkingChars).toBe(4)
    expect(stats.commentaryChars).toBe(2)
    expect(stats.annotationCount).toBe(2)
    expect(stats.annotationChars).toBe(4)
  })
  it('同日多节合并、乱序日期仍正确、模型 ID 区分同名模型', () => {
    const doc = derive([
      session('2026-09-19', [message({ modelInfo: { id: 'one', name: '同名' } })]),
      session('2026-09-17', [message({ modelInfo: { id: 'one', name: '同名' } })]),
      session('2026-09-19', [message({ modelInfo: { id: 'two', name: '同名' } })]),
    ])
    const stats = computeStats(doc)
    expect(stats.activeDays).toBe(2)
    expect(stats.topDays[0]!.count).toBe(2)
    expect(stats.models).toHaveLength(2)
    expect(stats.models[0]!.firstDate).toBe('2026-09-17')
    expect(filterStatsMessages(doc, { model: 'two' })).toHaveLength(1)
  })
  it('合并日期整理信息，消息心情优先，时段不继承上一条消息', () => {
    const doc = derive([
      session(
        '2026-09-19',
        [
          message({
            role: 'user',
            time: '2026-09-19 08:10',
            tags: ['日常'],
            mood: '开心',
          }),
          message({ role: 'user' }),
        ],
        { tags: ['日常', '周末'], mood: '平静', states: ['休息'] },
      ),
    ])
    expect(computeStats(doc).tags.find((tag) => tag.label === '日常')?.count).toBe(2)
    expect(filterStatsMessages(doc, { tag: '周末', mood: '平静', state: '休息' })).toHaveLength(1)
    expect(filterStatsMessages(doc, { hour: 8 })).toHaveLength(1)
    expect(computeStats(doc).timedMessages).toBe(1)
  })
  it('同长度的上一个时间段包括闰日，保留其他筛选', () => {
    expect(previousPeriod({ from: '2024-03-01', to: '2024-03-02', tag: '生活' })).toEqual({
      from: '2024-02-28',
      to: '2024-02-29',
      tag: '生活',
    })
    expect(previousPeriod({ from: '2026-09-20', to: '2026-09-19' })).toBeNull()
  })
})
