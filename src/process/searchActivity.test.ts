import { describe, expect, it } from 'vitest'
import { safePageUrl, searchActionOf, summarizeSearchActions } from './searchActivity'

describe('持久化检索动作', () => {
  it('兼容直接动作与嵌套动作，只接受已知形状的外部字段', () => {
    expect(
      searchActionOf('search', {
        action: { type: 'search', queries: ['资料', 123], query: '旧字段' },
      }),
    ).toEqual({ type: 'search', queries: ['资料'] })
    expect(searchActionOf('open_page', { url: 'https://example.com' })).toEqual({
      type: 'open_page',
      url: 'https://example.com',
    })
  })
  it('只生成安全网页链接', () => {
    expect(safePageUrl('javascript:alert(1)')).toBeNull()
    expect(safePageUrl('https://example.com/a')).toBe('https://example.com/a')
  })
  it('去重页面和讨论串，保留检索次数', () => {
    const summary = summarizeSearchActions([
      { type: 'search', queries: ['一', '二'] },
      { type: 'open_page', url: 'https://example.com' },
      { type: 'find_in_page', url: 'https://example.com', pattern: '一' },
      { type: 'x_keyword_search' },
      { type: 'x_thread_fetch', postId: '1' },
      { type: 'x_thread_fetch', postId: '1' },
    ])
    expect(summary).toEqual({
      webQueryCount: 2,
      blindSearchCount: 0,
      pageCount: 1,
      xSearchCount: 1,
      xThreadCount: 1,
    })
  })
})
