import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CitationSources } from '../components/CitationSources'
import { MessageItem } from '../components/MessageItem'
import { deriveDoc } from '../model/derive'
import { parseChatlog, serializeChatlog } from '../parser/chatlog'

describe('来源扩展阅读视图', () => {
  it.each([undefined, '', ' \n\t'])('正文为 %j 时显示纯数据来源的标题、链接与摘要', (text) => {
    const html = renderToStaticMarkup(createElement(CitationSources, {
      part: {
        kind: 'x-citations', text,
        data: {
          results: [
            { title: '官方资料', url: 'https://example.com/source', snippet: '资料摘要。' },
            { url: 'http://example.com/other' },
          ],
        },
      },
    }))
    expect(html).toContain('<strong>来源</strong>')
    expect(html).toContain('href="https://example.com/source"')
    expect(html).toContain('>官方资料</a>')
    expect(html).toContain('资料摘要。')
    expect(html).toContain('href="http://example.com/other"')
    expect(html).toContain('>http://example.com/other</a>')
  })

  it('优先显示已有 Markdown 阅读稿，不追加结构化来源', () => {
    const html = renderToStaticMarkup(createElement(CitationSources, {
      part: {
        kind: 'x-citations',
        text: '**来源**\n\n1. [作者整理的来源](https://example.com/readable)',
        data: { results: [{ title: '元数据来源', url: 'https://example.com/data' }] },
      },
    }))
    expect(html).toContain('href="https://example.com/readable"')
    expect(html.match(/<strong>来源<\/strong>/g)).toHaveLength(1)
    expect(html).not.toContain('元数据来源')
    expect(html).not.toContain('https://example.com/data')
  })

  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///private.txt', '//example.com'])('不将 %s 变成可点击链接', (url) => {
    const html = renderToStaticMarkup(createElement(CitationSources, {
      part: { kind: 'x-citations', data: { results: [{ url }] } },
    }))
    expect(html).toContain(url)
    expect(html).not.toContain('<a ')
  })

  it('元数据内的 HTML 和 Markdown 作为普通文字展示，字段类型异常不影响其他来源', () => {
    const html = renderToStaticMarkup(createElement(CitationSources, {
      part: {
        kind: 'x-citations',
        data: {
          results: [
            null, 1, [], { title: ['不应渲染'], url: { unexpected: true } },
            {
              title: '<img src=x onerror=alert(1)>',
              url: 'https://example.com/source',
              snippet: '<script>alert(1)</script> [其他链接](javascript:alert(2))',
            },
            { title: '没有网址的来源' },
            { snippet: '只有摘要的来源' },
          ],
        },
      },
    }))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('不应渲染')
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('没有网址的来源')
    expect(html).toContain('只有摘要的来源')
  })

  it('完整消息按块顺序展示纯数据来源，保留正文、原始字段与逐字写回', () => {
    const source = `---
format: chatlog-md/2
---
## @ai
回答的前半段。
<!-- @part x-citations -->
<!-- @meta
results:
  - title: 官方资料
    url: https://example.com/source
    snippet: 资料摘要。
    start_index: 0
    end_index: 4
    x-extra: [one, two]
x-provider: example
-->
<!-- @endpart -->
回答的后半段。
`
    const parsed = parseChatlog(source)
    const original = structuredClone(parsed)
    const html = renderToStaticMarkup(createElement(MessageItem, {
      msg: deriveDoc(parsed, []).messages[0]!,
    }))
    expect(html).toContain('href="https://example.com/source"')
    expect(html).toContain('资料摘要。')
    expect(html.indexOf('回答的前半段')).toBeLessThan(html.indexOf('<strong>来源</strong>'))
    expect(html.indexOf('<strong>来源</strong>')).toBeLessThan(html.indexOf('回答的后半段'))
    expect(parsed).toEqual(original)
    expect(parsed.sessions[0]!.messages[0]!.content).not.toContain('官方资料')
    expect(serializeChatlog(parsed)).toBe(source)
  })
})
