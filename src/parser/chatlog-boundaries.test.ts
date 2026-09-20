import { describe, expect, it } from 'vitest'
import { parseChatlog, serializeChatlog } from './chatlog'
import type { Message } from './types'

const HEADER = '---\nformat: chatlog-md/2\n---\n\n## @user\n\n'
const NEXT = '\n\n## @ai\n\n下一条消息\n'
const messages = (source: string) => parseChatlog(source).sessions.flatMap((day) => day.messages)

function writeText(text: string, explicit: boolean): string {
  const doc = parseChatlog(HEADER + '原内容' + NEXT)
  const message = doc.sessions[0]!.messages[0]!
  const change: Partial<Message> = explicit
    ? { parts: [{ kind: 'answer', text, data: { 'x-example': true } }] }
    : { content: text }
  doc.sessions[0]!.messages[0] = { ...message, ...change }
  return serializeChatlog(doc)
}

describe('v2 结构边界的对称转义', () => {
  it.each([false, true])('已有反斜杠链只增加再剥去一层，显式块=%s', (explicit) => {
    const markers = [
      '# @2099-01-01', '## 🤖 @ai', '🖼️ 图片.png', '📄 文件.pdf', '> 🤔 字面引用',
      '<!-- @part reasoning -->', '<!-- @endpart -->', '<!-- @meta',
      '<!-- @meta key=value -->',
    ]
    for (const marker of markers) {
      for (let count = 0; count <= 4; count++) {
        const text = `${'\\'.repeat(count)}${marker}`
        const written = writeText(text, explicit)
        const doc = parseChatlog(written)
        expect(doc.issues, text).toEqual([])
        expect(messages(written), text).toHaveLength(2)
        expect(messages(written)[0]!.content, text).toBe(text)
        expect(serializeChatlog(doc), text).toBe(written)
      }
    }
  })

  it.each([false, true])('普通 Markdown 转义不会被当成格式转义移除，显式块=%s', (explicit) => {
    const text = '\\# 普通标题\n\\## 另一个标题\n\\<!-- @metadata 普通文字 -->'
    expect(messages(writeText(text, explicit))[0]!.content).toBe(text)
  })

  it.each([false, true])('代码围栏内所有原有标记与反斜杠原样保存，显式块=%s', (explicit) => {
    for (const token of ['```', '~~~~']) {
      const text = `${token}md\n\\<!-- @part answer -->\n\\\\<!-- @meta\n<!-- @endpart -->\n## @ai\n${token}`
      const written = writeText(text, explicit)
      expect(messages(written)).toHaveLength(2)
      expect(messages(written)[0]!.content).toBe(text)
      expect(parseChatlog(written).issues).toEqual([])
    }
  })

  it.each([0, 1, 2, 3])('HTML 注释缩进 %s 空格时，内部结束标记不截断显式块', (indent) => {
    const text = `${' '.repeat(indent)}<!-- 普通注释\n\\<!-- @meta\n<!-- @endpart -->\n-->\n后续正文`
    const source = `${HEADER}<!-- @part answer -->\n${text}\n<!-- @endpart -->${NEXT}`
    const doc = parseChatlog(source)
    expect(doc.issues).toEqual([])
    expect(messages(source)).toHaveLength(2)
    expect(messages(source)[0]!.content).toBe(text)
    expect(messages(writeText(text, true))[0]!.content).toBe(text)
    expect(serializeChatlog(doc)).toBe(source)
  })

  it('四空格缩进的注释文本不进入 HTML 注释状态', () => {
    const text = '    <!-- 缩进代码'
    const written = writeText(text, true)
    expect(messages(written)).toHaveLength(2)
    expect(messages(written)[0]!.content).toBe(text)
    expect(parseChatlog(written).issues).toEqual([])
  })
})

describe('v2 围栏与未闭合输入的诊断', () => {
  it.each([false, true])('只有相同字符、足够长度、无尾随文本的标记关闭围栏，显式块=%s', (explicit) => {
    const text = '````md\n~~~\n```\n```` 不是关闭\n## @ai\n\\<!-- @endpart -->\n`````'
    const written = writeText(text, explicit)
    expect(messages(written)).toHaveLength(2)
    expect(messages(written)[0]!.content).toBe(text)
    expect(parseChatlog(written).issues).toEqual([])
  })

  it('同一行内闭合的反引号代码不被误判为未闭合围栏', () => {
    const text = '```inline```\n普通正文'
    const written = writeText(text, true)
    expect(messages(written)).toHaveLength(2)
    expect(messages(written)[0]!.content).toBe(text)
    expect(parseChatlog(written).issues).toEqual([])
  })

  it.each(['\u2028', '\u2029'])('围栏语言说明包含 Unicode 分隔符 %j 时仍完整隔离内部标记', (separator) => {
    for (const token of ['```', '~~~']) {
      const text = `${token}text${separator}info\n<!-- @endpart -->\n\\<!-- @meta\n${token}`
      const source = `${HEADER}<!-- @part answer -->\n${text}\n<!-- @endpart -->${NEXT}`
      const doc = parseChatlog(source)
      expect(doc.issues).toEqual([])
      expect(messages(source)).toHaveLength(2)
      expect(messages(source)[0]!.content).toBe(text)
      expect(messages(writeText(text, true))[0]!.content).toBe(text)
      expect(serializeChatlog(doc)).toBe(source)
    }
  })

  it.each([
    ['```md', 'unclosed-fence'],
    ['~~~~', 'unclosed-fence'],
    ['<!-- 未结束的注释', 'unclosed-comment'],
    ['  <!-- 未结束的注释', 'unclosed-comment'],
  ])('未闭合的 %s 报告位置并原样保留，不能猜测代码中的消息头', (opening, rule) => {
    const source = HEADER + opening + '\n原始内容' + NEXT
    const doc = parseChatlog(source)
    expect(doc.issues).toContainEqual(expect.objectContaining({ level: 'error', rule, line: 7 }))
    expect(doc.sessions[0]!.messages).toHaveLength(1)
    expect(doc.sessions[0]!.messages[0]!.content).toContain('## @ai')
    expect(serializeChatlog(doc)).toBe(source)
  })

  it('显式内容块未闭合时同时保留内部围栏错误与全部原文', () => {
    const source = HEADER + '<!-- @part answer -->\n```md\n原始内容\n<!-- @endpart -->' + NEXT
    const doc = parseChatlog(source)
    expect(doc.issues.map((issue) => issue.rule)).toEqual(expect.arrayContaining(['unclosed-fence', 'unclosed-part']))
    expect(serializeChatlog(doc)).toBe(source)
  })

  it('集成方补齐截断围栏后可通过扩展保留原文，并继续解析下一条消息', () => {
    const original = '```md\n生成中断在这里'
    const source = HEADER + '<!-- @part answer -->\n<!-- @meta\nx-happychat:\n  original_text: "```md\\n生成中断在这里"\n-->\n' + original + '\n```\n<!-- @endpart -->' + NEXT
    const doc = parseChatlog(source)
    expect(doc.issues).toEqual([])
    expect(messages(source)).toHaveLength(2)
    expect(messages(source)[0]!.parts?.[0]?.data?.['x-happychat']).toEqual({ original_text: original })
    expect(serializeChatlog(doc)).toBe(source)
  })
})
