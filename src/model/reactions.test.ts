import { describe, expect, it } from 'vitest'
import { uniqueReactions, usedReactions } from './reactions'

describe('可收藏的文档表情', () => {
  it('保留复合表情，去掉空值和重复收藏', () => {
    expect(uniqueReactions([' ❤️ ', '👨‍👩‍👧‍👦', '❤️', ''])).toEqual(['❤️', '👨‍👩‍👧‍👦'])
  })
  it('从日期和消息中发现表情，常用表情排在前面，不修改文档', () => {
    const document = {
      sessions: [
        {
          reactions: ['🌻'],
          messages: [
            { reactions: ['🫶', '🌻'] },
            { reactions: ['🫶', '🫶'] },
            { reactions: ['🫶', '☁️'] },
          ],
        },
      ],
    }
    const before = JSON.stringify(document)
    expect(usedReactions(document)).toEqual(['🫶', '🌻', '☁️'])
    expect(JSON.stringify(document)).toBe(before)
    expect(usedReactions(null)).toEqual([])
  })
})
