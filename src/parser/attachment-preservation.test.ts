import { describe, expect, it } from 'vitest'
import { createMessageDraft, withParts } from '../editor/types'
import { applyMessageEdit } from '../model/mutations'
import { parseChatlog, serializeChatlog } from './chatlog'
import type { Attachment, ChatDoc, Message } from './types'

const date = '2040-04-12'
const front = '---\nformat: chatlog-md/2\ntitle: 虚构附件测试\n---\n\n'
const first = (doc: ChatDoc) => doc.sessions[0]!.messages[0]!
const bodySource = (message: Message) => message._source!.raw.slice(message._source!.bodyStart)
const documentWith = (body: string, eol = '\n') =>
  `${front}# @${date}\n\n## 🧑‍💻 @user · ${date} 10:30\n\n${body}\n\n`.replaceAll('\n', eol)

// 故意混用兼容的图标、纯名附件、含括号路径和空行，避免只验证规范化后的结果。
const imageLines = [
  '🖼 [横图 A.jpg](assets/synthetic-a.jpg)',
  '🖼️ [竖图 B.png](assets/synthetic-b(2).png)',
  '🖼️ 没有路径的 C.png',
  '🖼️ [横图 D.jpg](assets/synthetic-d.jpg)',
]
const ordinaryBody = `  前文保留空格  \n\n\n${imageLines.join('\n')}\n\n后文保留\n`

function expectStable(text: string) {
  let current = text
  for (let round = 0; round < 3; round++) {
    const doc = parseChatlog(current)
    expect(doc.issues.filter((issue) => issue.level === 'error')).toEqual([])
    current = serializeChatlog(structuredClone(doc))
    expect(current).toBe(text)
  }
}

describe.each([
  ['LF', '\n'],
  ['CRLF', '\r\n'],
])('附件简写的局部写回 · %s', (_name, eol) => {
  it('经真实编辑器只改收藏、标签和记录 ID，正文逐字节不变', () => {
    const source = documentWith(ordinaryBody, eol)
    const doc = parseChatlog(source)
    const before = bodySource(first(doc))
    const draft = createMessageDraft(first(doc), date)
    draft.starred = true
    draft.tags = ['虚构标签', '图片']
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message).toMatchObject({ starred: true, tags: ['虚构标签', '图片'] })
    expect(message.id).toBeTruthy()
    expect(bodySource(message)).toBe(before)
    expect(text).not.toContain('<!-- @part attachment -->')
    expectStable(text)
  })

  it('withParts 编辑普通正文时，四张图片原行、连续性和前后位置不变', () => {
    const doc = parseChatlog(documentWith(ordinaryBody, eol))
    const original = first(doc)
    const draft = withParts(
      createMessageDraft(original, date),
      original.parts!.map((part) =>
        part.kind === 'answer' && part.text?.includes('后文保留')
          ? { ...part, text: part.text.replace('后文保留', '后文已修改') }
          : part,
      ),
    )
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(bodySource(message)).toBe(bodySource(original).replace('后文保留', '后文已修改'))
    expect(text).toContain(imageLines.join(eol))
    expect(text).not.toContain('<!-- @part attachment -->')
    expect(text).not.toContain('<!-- @part answer -->')
    expect(message.parts?.map((part) => part.kind)).toEqual([
      'answer',
      'attachment',
      'attachment',
      'attachment',
      'attachment',
      'answer',
    ])
    expect(message.attachments).toEqual(original.attachments)
    expectStable(text)
  })

  it('修改附件名称、路径仍为简写，其余图行和正文保持原样', () => {
    const doc = parseChatlog(documentWith(ordinaryBody, eol))
    const original = first(doc)
    const draft = createMessageDraft(original, date)
    draft.attachments[1] = {
      ...draft.attachments[1]!,
      name: '更名后的 B.png',
      path: 'assets/synthetic-b-new.png',
    }
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(bodySource(message)).toBe(
      bodySource(original).replace(
        imageLines[1]!,
        '🖼️ [更名后的 B.png](assets/synthetic-b-new.png)',
      ),
    )
    expect(message.attachments).toEqual(draft.attachments)
    expect(text).not.toContain('<!-- @part attachment -->')
    expectStable(text)
  })

  it('同次新增、删除、重排附件后，数量、顺序和前后正文均完整', () => {
    const doc = parseChatlog(documentWith(ordinaryBody, eol))
    const original = first(doc)
    const draft = createMessageDraft(original, date)
    const added: Attachment = {
      kind: 'image',
      name: '新增 E.png',
      path: 'assets/synthetic-e.png',
      meta: {},
    }
    draft.attachments = [draft.attachments[3]!, added, draft.attachments[0]!]
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.attachments).toEqual(draft.attachments)
    expect(message.parts?.map((part) => part.kind)).toEqual([
      'answer',
      'attachment',
      'attachment',
      'attachment',
      'answer',
    ])
    expect(message.content).toBe(original.content)
    expect(text).toContain(imageLines[0]!)
    expect(text).toContain(imageLines[3]!)
    expect(text).toContain('🖼️ [新增 E.png](assets/synthetic-e.png)')
    expect(text).not.toContain(imageLines[1]!)
    expect(text).not.toContain(imageLines[2]!)
    expect(text).not.toContain('<!-- @part attachment -->')
    expectStable(text)
  })
})

describe('需要显式块的附件', () => {
  const explicit = `<!-- @part attachment -->
<!-- @meta
# 虚构附件的扩展说明
id: synthetic-attachment
kind: image
name: 复杂图片.png
path: assets/synthetic-complex.png
meta:
  dimensions: {width: 1200, height: 800}
  x-extra: [null, {enabled: true}]
x-future:
  nested: [1, {keep: 原样}]
-->
附件附带的文字内容。
<!-- @endpart -->`

  it('编辑相邻回答不会简化或重写包含 ID、文字和未知嵌套数据的显式附件', () => {
    const doc = parseChatlog(documentWith(`前文\n\n${explicit}\n\n后文`))
    const original = first(doc)
    const draft = withParts(
      createMessageDraft(original, date),
      original.parts!.map((part) =>
        part.kind === 'answer' && part.text === '后文' ? { ...part, text: '新的后文' } : part,
      ),
    )
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(text).toContain(explicit)
    expect(message.parts?.find((part) => part.kind === 'attachment')).toEqual(
      original.parts?.find((part) => part.kind === 'attachment'),
    )
    expect(message.content).toBe('前文\n\n新的后文')
    expectStable(text)
  })

  it('修改显式附件的名称时保留 ID、文字、未知字段及嵌套元数据', () => {
    const doc = parseChatlog(documentWith(`前文\n\n${explicit}\n\n后文`))
    const originalPart = first(doc).parts!.find((part) => part.kind === 'attachment')!
    const draft = createMessageDraft(first(doc), date)
    draft.attachments[0]!.name = '复杂图片改名.png'
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.parts?.find((part) => part.kind === 'attachment')).toEqual({
      ...originalPart,
      data: { ...originalPart.data, name: '复杂图片改名.png' },
    })
    expect(message.attachments[0]).toEqual(draft.attachments[0])
    expect(text).toContain('# 虚构附件的扩展说明')
    expectStable(text)
  })

  it.each(['删除', '交换'])('%s复杂附件后，原文注释与扩展信息跟随对应图片', (operation) => {
    const secondBlock = explicit
      .replaceAll('synthetic-attachment', 'synthetic-second')
      .replaceAll('复杂图片.png', '第二张.png')
      .replaceAll('synthetic-complex.png', 'second.png')
      .replace('虚构附件的扩展说明', '第二张独有的注释')
      .replace('附件附带的文字内容。', '第二张独有的说明。')
    const doc = parseChatlog(documentWith(`${explicit}\n\n中间的文字\n\n${secondBlock}`))
    const message = first(doc)
    const oldParts = message.parts!
    message.attachments =
      operation === '删除' ? [message.attachments[1]!] : [...message.attachments].reverse()
    const text = serializeChatlog(doc)
    const saved = first(parseChatlog(text))
    expect(saved.parts).toEqual(
      operation === '删除' ? [oldParts[1], oldParts[2]] : [oldParts[2], oldParts[1], oldParts[0]],
    )
    expect(text).toContain(secondBlock)
    if (operation === '交换') expect(text).toContain(explicit)
    expectStable(text)
  })

  it('普通新图片默认生成简写，复杂附件保留显式数据且反复保存稳定', () => {
    const doc = parseChatlog(front)
    const draft = withParts(createMessageDraft(null, date), [{ kind: 'answer', text: '新记录' }])
    draft.attachments = [
      { kind: 'image', name: '新图片.png', path: 'assets/synthetic-new.png', meta: {} },
      { kind: 'file', name: '资料.pdf', path: null, meta: {} },
      {
        kind: 'image',
        name: '含扩展.png',
        path: 'assets/synthetic-rich.png',
        meta: { x: { keep: [1, 2] } },
      },
    ]
    applyMessageEdit(doc, draft)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(text).toContain('🖼️ [新图片.png](assets/synthetic-new.png)')
    expect(text).toContain('📄 资料.pdf')
    expect(text.match(/<!-- @part attachment -->/g)).toHaveLength(1)
    expect(message.attachments).toEqual(draft.attachments)
    expect(message.content).toBe('新记录')
    expectStable(text)
  })
})

describe('附件变化后的正文边界', () => {
  const literalMeta = '<!-- @meta\nstarred: true\nx-literal: 这只是正文\n-->'

  it.each(['\n', '\r\n'])('删除开头附件不会把其后的普通引用变为思考块（%j）', (eol) => {
    const literal = '> 🤔 这是一句正文引用\n> 请保留这句引用。\n\n正文结尾'
    const doc = parseChatlog(documentWith(`${imageLines[0]}\n\n${literal}`, eol))
    const original = first(doc)
    expect(original.thinking).toBeNull()
    original.attachments = []

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.thinking).toBeNull()
    expect(message.content).toBe(literal)
    expect(message.parts?.every((part) => part.kind === 'answer')).toBe(true)
    expect(message.attachments).toEqual([])
    expectStable(text)
  })

  it.each(['\n', '\r\n'])('删除开头附件不会把原正文的 @meta 注释吞为消息属性（%j）', (eol) => {
    const literal = `${literalMeta}\n\n正文结尾`
    const doc = parseChatlog(documentWith(`${imageLines[0]}\n\n${literal}`, eol))
    expect(first(doc).content).toBe(literal)
    first(doc).attachments = []

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.meta).toEqual({})
    expect(message.starred).toBeUndefined()
    expect(message.content).toBe(literal)
    expect(message.attachments).toEqual([])
    expectStable(text)
  })

  it.each(['plain', 'explicit'])('修改 %s answer 为 @meta 字面量仍完整往返', (style) => {
    const body =
      style === 'plain' ? '原始正文' : '<!-- @part answer -->\n原始正文\n<!-- @endpart -->'
    const doc = parseChatlog(documentWith(body))
    const original = first(doc)
    doc.sessions[0]!.messages[0] = withParts(
      createMessageDraft(original, date),
      original.parts!.map((part) => ({ ...part, text: literalMeta })),
    )

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.meta).toEqual({})
    expect(message.content).toBe(literalMeta)
    expect(message.parts).toHaveLength(1)
    expect(message.parts![0]!.data).toBeUndefined()
    expectStable(text)
  })

  it.each(['plain', 'explicit'])('新增 %s answer 的 @meta 字面量不会变成块元数据', (style) => {
    const doc = parseChatlog(front)
    // 相邻回答需要显式边界；这也覆盖没有其他块属性时，正文首行就是 @meta 的情况。
    const parts = [
      ...(style === 'explicit' ? [{ kind: 'answer', text: '前一段回答' }] : []),
      { kind: 'answer', text: literalMeta },
    ]
    const draft = withParts(createMessageDraft(null, date), parts)
    applyMessageEdit(doc, draft)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.content).toBe(parts.map((part) => part.text).join('\n\n'))
    expect(message.parts?.map((part) => part.text)).toEqual(parts.map((part) => part.text))
    expect(message.parts?.every((part) => part.data === undefined)).toBe(true)
    expect(message.starred).toBeUndefined()
    expectStable(text)
  })

  it('显式清空 parts 后不以旧附件列表恢复已经删除的内容块', () => {
    const doc = parseChatlog(documentWith(`正文\n\n${imageLines[0]}`))
    const draft = withParts(createMessageDraft(first(doc), date), [])
    expect(draft.attachments).toHaveLength(1)
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.parts).toEqual([])
    expect(message.attachments).toEqual([])
    expect(message.content).toBe('')
    expect(message.thinking).toBeNull()
    expectStable(text)
  })

  it('向原附件组追加新附件时仍位于后文之前', () => {
    const doc = parseChatlog(documentWith(`前文\n\n${imageLines[0]}\n\n后文`))
    const draft = createMessageDraft(first(doc), date)
    draft.attachments.push({
      kind: 'image',
      name: '追加.png',
      path: 'assets/appended.png',
      meta: {},
    })
    applyMessageEdit(doc, draft, 0)

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.parts?.map((part) => part.kind)).toEqual([
      'answer',
      'attachment',
      'attachment',
      'answer',
    ])
    expect(message.parts?.at(-1)?.text).toBe('后文')
    expect(message.attachments).toEqual(draft.attachments)
    expectStable(text)
  })

  it('删除夹在两段文字之间的全部附件不丢失前文、后文和先后关系', () => {
    const doc = parseChatlog(documentWith(`前文\n\n${imageLines[0]}\n\n后文`))
    first(doc).attachments = []

    const text = serializeChatlog(doc)
    const message = first(parseChatlog(text))
    expect(message.attachments).toEqual([])
    expect(message.parts?.map((part) => part.text)).toEqual(['前文', '后文'])
    expect(message.content).toBe('前文\n\n后文')
    expectStable(text)
  })
})
