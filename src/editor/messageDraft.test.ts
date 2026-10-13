import { describe, expect, it } from 'vitest'
import { deriveDoc } from '../model/derive'
import { applyMessageEdit } from '../model/mutations'
import { parseChatlog, serializeChatlog } from '../parser/chatlog'
import {
  clockOf,
  createMessageDraft,
  draftParts,
  insertionIndex,
  withClock,
  withParts,
} from './types'

// 全部为虚构内容；特意将正文与简写附件交错，保留单换行和行尾空格。
const source = [
  '---',
  'format: chatlog-md/2',
  '---',
  '',
  '# @2026-09-20',
  '',
  '## 👤 @user · 2026-09-20 09:00',
  '<!-- @meta',
  'id: fixture-record',
  '-->',
  '',
  '示例开头  ',
  '🖼️ [示例照片.jpg](assets/example.jpg)',
  '示例结尾',
  '📄 [示例笔记.pdf](assets/example.pdf)',
  '',
].join('\r\n')

function setup() {
  const doc = parseChatlog(source)
  const derived = deriveDoc(doc, [])
  const draft = createMessageDraft(derived.messages[0]!, '2026-09-20')
  return { doc, draft }
}

describe('记录编辑保留未改正文', () => {
  it('原样保存以及内容块值未变时，整个文件保持逐字节一致', () => {
    const { doc, draft } = setup()
    const next = withParts(draft, structuredClone(draftParts(draft)))
    expect(next).toBe(draft)
    applyMessageEdit(doc, next, 0)
    expect(serializeChatlog(doc)).toBe(source)
  })

  it.each([
    { starred: true },
    { tags: ['示例标签'] },
    { mood: '平静', states: ['休息'] },
    { reactions: ['🌤️'] },
    { annotations: [{ id: 'fixture-note', text: '示例批注' }] },
  ])('只更新个人字段 %j 时，不重写简写附件与正文', (patch) => {
    const { doc, draft } = setup()
    const before = structuredClone(doc.sessions[0]!.messages[0]!)
    applyMessageEdit(doc, { ...draft, ...patch }, 0)
    const after = doc.sessions[0]!.messages[0]!
    expect(after.parts).toEqual(before.parts)
    expect(after.attachments).toEqual(before.attachments)
    expect(after.content).toBe(before.content)
    expect(after._source).toEqual(before._source)
    expect(serializeChatlog(doc).split('-->')[1]).toBe(source.split('-->')[1])
  })

  it('调整过程信息不会为附件两侧正文额外添加空行', () => {
    const { draft } = setup()
    const next = withParts(draft, [
      { kind: 'commentary', text: '示例过程说明' },
      ...draftParts(draft),
    ])
    expect(next.content).toBe(draft.content)
    expect(next.attachments).toEqual(draft.attachments)
  })

  it('正文编辑后改回原内容，不留下序列化差异', () => {
    const { doc, draft } = setup()
    const changed = withParts(
      draft,
      draftParts(draft).map((part, index) =>
        index === 0 ? { ...part, text: `${part.text}，编辑后` } : part,
      ),
    )
    expect(changed.content).not.toBe(draft.content)
    const restored = withParts(changed, structuredClone(draftParts(draft)))
    expect(restored.content).toBe(draft.content)
    applyMessageEdit(doc, restored, 0)
    expect(serializeChatlog(doc)).toBe(source)
  })

  it('派生阅读字段不会随完整消息回写到数据模型', () => {
    const doc = parseChatlog(source)
    const derived = deriveDoc(doc, []).messages[0]!
    applyMessageEdit(doc, { ...derived, date: '2026-09-20' }, 0)
    const saved = doc.sessions[0]!.messages[0]!
    for (const field of [
      'index',
      'sessionIndex',
      'effectiveDate',
      'effectiveTime',
      'contentChars',
      'thinkingSeconds',
      'dayContext',
    ])
      expect(saved).not.toHaveProperty(field)
    expect(serializeChatlog(doc)).toBe(source)
  })
})

describe('记录所在日期与消息时间', () => {
  // 虚构的跨日记录：零点后继续的对话仍写在前一天的日期节里。
  const crossDay = [
    '---',
    'format: chatlog-md/2',
    '---',
    '',
    '# @2026-09-19',
    '',
    '## 🤖 @ai · 2026-09-20 00:10',
    '',
    '示例回复',
    '',
  ].join('\n')

  it('以所在日期节编辑跨日记录，保存后不会移到时间所属的日期', () => {
    const doc = parseChatlog(crossDay)
    const message = deriveDoc(doc, []).messages[0]!
    expect(message.effectiveDate).toBe('2026-09-20')
    const draft = createMessageDraft(message, doc.sessions[0]!.date!)
    applyMessageEdit(doc, { ...draft, content: '示例回复，补充一句' }, 0)
    expect(doc.sessions).toHaveLength(1)
    expect(doc.sessions[0]!.messages[0]!.time).toBe('2026-09-20 00:10')
  })

  it('只替换时刻，保留时间自身的日期与只记日期的精度', () => {
    expect(clockOf('2026-09-20 00:10')).toBe('00:10')
    expect(clockOf('2026-09-20 00:10:05')).toBe('00:10:05')
    expect(clockOf('2026-09-20')).toBe('')
    expect(clockOf(null)).toBe('')
    expect(withClock('2026-09-20 00:10', '2026-09-19', '00:30', false)).toBe('2026-09-20 00:30')
    expect(withClock(null, '2026-09-19', '21:30', false)).toBe('2026-09-19 21:30')
    expect(withClock('2026-09-19 21:30', '2026-09-19', '', false)).toBeNull()
    expect(withClock('2026-09-19 21:30', '2026-09-19', '', true)).toBe('2026-09-19')
  })
})

describe('新增内容块的位置', () => {
  const parts = [
    { kind: 'reasoning', text: '示例思考' },
    { kind: 'answer', text: '示例正文' },
    { kind: 'attachment', data: { kind: 'image', name: '示例.jpg' } },
  ]

  it('思考、过程说明与检索插在第一段正文之前', () => {
    for (const kind of ['reasoning', 'commentary', 'search'])
      expect(insertionIndex(parts, kind)).toBe(1)
    expect(insertionIndex([{ kind: 'attachment' }], 'reasoning')).toBe(1)
  })

  it('正文与其他内容追加到末尾', () => {
    expect(insertionIndex(parts, 'answer')).toBe(3)
    expect(insertionIndex(parts, 'x-note')).toBe(3)
  })
})
