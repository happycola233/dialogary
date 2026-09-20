import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProcessTrack } from '../components/ProcessTrack'
import { MessageItem } from '../components/MessageItem'
import { parseChatlog, serializeChatlog } from '../parser/chatlog'
import { deriveDoc } from '../model/derive'

describe('保存后的有序过程轨', () => {
  it('只记录了耗时而没有思考正文时，仍展示真实耗时', () => {
    const text = renderToStaticMarkup(
      createElement(ProcessTrack, { parts: [{ kind: 'reasoning', data: { duration_ms: 8000 } }] }),
    )
    expect(text).toContain('已思考 8s')
  })
  it('从完整消息传递旧推理标题，连续附件合并显示，不在缩略图外显示文件名或下载按钮', () => {
    const parsed = parseChatlog(
      '---\nformat: chatlog-md/2\n---\n# @2026-09-19\n## 🤖 @ai · 12:00\n> 🤔 已思考 1m 24s\n>\n> 思考摘要。\n\n正文。\n\n🖼️ [first.png](assets/first.png)\n🖼️ [second.png](assets/second.png)\n',
    )
    const document = deriveDoc(parsed, [])
    const text = renderToStaticMarkup(createElement(MessageItem, { msg: document.messages[0]! }))
    expect(text).toContain('已思考 84s')
    expect(text).not.toContain('已完成思考')
    expect(text).toContain('data-count="2"')
    expect(text).not.toContain('<figcaption')
    expect(text).not.toContain('下载图片')
  })
  it('保留推理、进展、检索、再次推理的顺序，不重复旧兼容投影', () => {
    const text = renderToStaticMarkup(
      createElement(ProcessTrack, {
        expanded: true,
        thinking: { label: '已思考 3s', text: '第一段推理' },
        parts: [
          { kind: 'reasoning', text: '第一段推理' },
          { kind: 'commentary', text: '接下来查询资料' },
          { kind: 'search', data: { type: 'search', queries: ['唯一检索词'] } },
          { kind: 'reasoning', text: '第二段推理' },
          { kind: 'answer', text: '父组件负责展示正文' },
        ],
      }),
    )
    expect(text.match(/第一段推理/g)).toHaveLength(1)
    expect(text.indexOf('第一段推理')).toBeLessThan(text.indexOf('接下来查询资料'))
    expect(text.indexOf('接下来查询资料')).toBeLessThan(text.indexOf('唯一检索词'))
    expect(text.indexOf('唯一检索词')).toBeLessThan(text.indexOf('第二段推理'))
    expect(text).not.toContain('父组件负责展示正文')
  })
  it('默认折叠的步骤不能获取键盘焦点，危险网址只展示文字', () => {
    const text = renderToStaticMarkup(
      createElement(ProcessTrack, {
        parts: [{ kind: 'search', data: { type: 'open_page', url: 'javascript:alert(1)' } }],
      }),
    )
    expect(text).toContain('inert=""')
    expect(text).not.toContain('href="javascript:')
    expect(text).toContain('javascript:alert(1)')
  })
  it('回答前只有 commentary 时，不把后面的推理投影提前插入', () => {
    const text = renderToStaticMarkup(
      createElement(ProcessTrack, {
        thinking: { label: '思考过程', text: '回答后的推理' },
        parts: [{ kind: 'commentary', text: '回答前的进展' }],
      }),
    )
    expect(text).toContain('回答前的进展')
    expect(text).not.toContain('回答后的推理')
  })

  it('没有思考正文时只展示已记录的整轮时长，不补造可展开步骤', () => {
    const text = renderToStaticMarkup(createElement(ProcessTrack, { reasoningTotalSeconds: 12.5 }))
    expect(text).toContain('已思考 12s')
    expect(text).not.toContain('<button')
    expect(text).not.toContain('<ol')
  })

  it('从消息元数据读取整轮时长，在单组过程内展示但不为多段思考补造时长', () => {
    const parsed = parseChatlog(`---
format: chatlog-md/2
---
## @ai
<!-- @meta
x-generation:
  reasoning_duration_ms: 12500
-->
<!-- @part reasoning -->
第一段推理。
<!-- @endpart -->
<!-- @part commentary -->
正在核对。
<!-- @endpart -->
<!-- @part reasoning -->
第二段推理。
<!-- @endpart -->
<!-- @part answer -->
最终回答。
<!-- @endpart -->
`)
    const document = deriveDoc(parsed, [])
    const text = renderToStaticMarkup(createElement(MessageItem, { msg: document.messages[0]! }))
    expect(document.messages[0]!.thinkingSeconds).toBe(12.5)
    expect(text).toContain('已思考 12s')
    expect(text.match(/data-testid="process-track"/g)).toHaveLength(1)
    expect(text).not.toContain('data-testid="reasoning-total"')
    expect(
      parsed.sessions[0]!.messages[0]!.parts!.filter((part) => part.kind === 'reasoning'),
    ).toEqual([
      { kind: 'reasoning', text: '第一段推理。' },
      { kind: 'reasoning', text: '第二段推理。' },
    ])
  })

  it('过程被回答拆开时，整轮耗时只显示一次，各组不分摊完整耗时', () => {
    const parsed = parseChatlog(`---
format: chatlog-md/2
---
## @ai
<!-- @meta
x-generation:
  reasoning_duration_ms: 12000
-->
<!-- @part reasoning -->
回答前的推理。
<!-- @endpart -->
<!-- @part answer -->
第一段回答。
<!-- @endpart -->
<!-- @part reasoning -->
回答后的推理。
<!-- @endpart -->
`)
    const text = renderToStaticMarkup(
      createElement(MessageItem, { msg: deriveDoc(parsed, []).messages[0]! }),
    )
    expect(text.match(/已思考 12s/g)).toHaveLength(1)
    expect(text.match(/data-testid="process-track"/g)).toHaveLength(2)
    expect(text.indexOf('回答前的推理')).toBeLessThan(text.indexOf('第一段回答'))
    expect(text.indexOf('第一段回答')).toBeLessThan(text.indexOf('回答后的推理'))
  })

  it('来源扩展直接显示中文标题与可点击 Markdown，结构化定位与未知字段完整保留', () => {
    const source = `---
format: chatlog-md/2
---
## @ai
回答正文。
<!-- @part x-citations -->
<!-- @meta
results:
  - title: 官方资料
    url: https://example.com/source
    start_index: 0
    end_index: 4
    x-extra: [one, two]
-->
**来源**

1. [官方资料](https://example.com/source)
<!-- @endpart -->
`
    const parsed = parseChatlog(source)
    const text = renderToStaticMarkup(
      createElement(MessageItem, { msg: deriveDoc(parsed, []).messages[0]! }),
    )
    expect(text).toContain('<section aria-label="来源"')
    expect(text).toContain('<strong>来源</strong>')
    expect(text).toContain('href="https://example.com/source"')
    expect(text).not.toContain('<summary>x-citations</summary>')
    expect(text).not.toContain('<pre')
    expect(serializeChatlog(parsed)).toBe(source)
  })
})
