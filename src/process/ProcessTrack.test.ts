import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProcessTrack } from '../components/ProcessTrack'
import { MessageItem } from '../components/MessageItem'
import { parseChatlog } from '../parser/chatlog'
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
})
