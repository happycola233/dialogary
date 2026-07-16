import { describe, expect, it } from 'vitest'
import type { DerivedMessage } from '../model/derive'
import { estimateMessagePlaceholderHeight } from './messageHeight'

function message(overrides: Partial<DerivedMessage> = {}): DerivedMessage {
  return {
    id: 'm0',
    index: 0,
    sessionIndex: 0,
    effectiveDate: null,
    effectiveTime: null,
    contentChars: 0,
    thinkingSeconds: null,
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
  }
}

describe('message placeholder height estimate', () => {
  it('keeps empty messages usable and scales with long Markdown', () => {
    expect(estimateMessagePlaceholderHeight(message())).toBe(64)
    expect(estimateMessagePlaceholderHeight(message({ content: '正文'.repeat(1000) }))).toBeGreaterThan(1000)
  })

  it('reserves one stable thumbnail row for every two images', () => {
    const image = { kind: 'image' as const, name: 'x.png', path: 'x.png', meta: {} }
    const two = estimateMessagePlaceholderHeight(message({ attachments: [image, image] }))
    const three = estimateMessagePlaceholderHeight(message({ attachments: [image, image, image] }))
    expect(three - two).toBe(188)
  })
})
