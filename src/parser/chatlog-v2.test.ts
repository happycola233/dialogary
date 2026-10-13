import { describe, expect, it } from 'vitest'
import { migrateV1ToV2, parseChatlog, serializeChatlog, verifyMigration } from './chatlog'
import type { ChatDoc, Message } from './types'
import { applyMessageEdit, ensureDay } from '../model/mutations'
import { createMessageDraft, withParts } from '../editor/types'

const FM = '---\nformat: chatlog-md/2\ntitle: 虚构测试\ntimezone: Asia/Shanghai\n---\n\n'
const first = (doc: ChatDoc) => doc.sessions[0]!.messages[0]!
const edit = (source: string, change: Partial<Message>) => {
  const doc = parseChatlog(source)
  doc.sessions[0]!.messages[0] = { ...first(doc), ...change }
  return serializeChatlog(doc)
}

describe('v2 保真读写', () => {
  const complex = FM + '# @2026-09-19\n<!-- @meta\ntags: [生活]\nmood: 平静\nx-personal:\n  enabled: true\n-->\n\n## 🧑‍💻 @user · 2026-09-19 21:10\n<!-- @meta\n# 留下这条 YAML 注释\nid: m-one\ntags: [读书]\nx-future:\n  nested: [null, 7, {v: true}]\n-->\n\n  正文保留空格  \n\n```md\n# @2099-01-01\n## 🤖 @ai\n<!-- @meta\nid: code-example\n-->\n```\n\n<!-- 普通注释\n## 🤖 @ai\n-->\n\n## 🤖 @ai\n\n回答。'

  it.each(['LF', 'CRLF'])('%s 与 BOM、注释、围栏、未知嵌套字段逐字节往返', (newline) => {
    const text = '\uFEFF' + (newline === 'CRLF' ? complex.replaceAll('\n', '\r\n') : complex)
    const doc = parseChatlog(text)
    expect(doc.sessions).toHaveLength(1)
    expect(doc.sessions[0]!.messages).toHaveLength(2)
    expect(serializeChatlog(doc)).toBe(text)
    expect(serializeChatlog(structuredClone(doc))).toBe(text)
    expect(first(doc).meta['x-future']).toEqual({ nested: [null, 7, { v: true }] })
  })

  it('只改标签不改正文，保留 YAML 注释、未知字段和另一条消息', () => {
    const source = complex.replaceAll('\n', '\r\n')
    const before = parseChatlog(source)
    const result = edit(source, { tags: ['生活', '保留'] })
    const after = parseChatlog(result)
    const oldMessage = first(before)
    const newMessage = first(after)
    expect(newMessage.tags).toEqual(['生活', '保留'])
    expect(newMessage._source!.raw.slice(newMessage._source!.bodyStart)).toBe(oldMessage._source!.raw.slice(oldMessage._source!.bodyStart))
    expect(after.sessions[0]!.messages[1]!._source!.raw).toBe(before.sessions[0]!.messages[1]!._source!.raw)
    expect(result).toContain('# 留下这条 YAML 注释')
    expect(newMessage.meta['x-future']).toEqual(oldMessage.meta['x-future'])
  })

  it('模型、用量、日期和个人字段全部独立写回', () => {
    const text = FM + '# @2026-09-19\n\n## 🤖 @ai\n\n内容\n'
    const result = edit(text, {
      modelInfo: { id: 'test-1', name: '测试模型', reasoningEffort: 'custom-effort' },
      usage: { input_tokens: 1200, output_tokens: 300, cache_read_tokens: 800, cache_write_tokens: 200, reasoning_tokens: 100, 'x-future': { audio: 2 } },
      tags: ['测试'], reactions: ['🌱'], states: ['疲惫'], mood: '平静', starred: true,
      annotations: [{ id: 'a1', text: '批注', quote: '内容', createdAt: '2026-09-19T10:00:00Z' }],
    })
    const message = first(parseChatlog(result))
    expect(message.modelInfo).toEqual({ id: 'test-1', name: '测试模型', reasoningEffort: 'custom-effort' })
    expect(message.usage).toMatchObject({ input_tokens: 1200, reasoning_tokens: 100, 'x-future': { audio: 2 } })
    expect(message.annotations?.[0]?.quote).toBe('内容')
    expect(message.states).toEqual(['疲惫'])
    expect(message.reactions).toEqual(['🌱'])
  })

  it('允许直接修改原始元数据，不被未改动的规范化字段覆盖', () => {
    const source = FM + '## 🧑‍💻 @user\n<!-- @meta\ntags: [旧]\n-->\n\n正文\n'
    const result = edit(source, { meta: { tags: ['新'], 'x-nested': { future: 1 } } })
    expect(first(parseChatlog(result)).tags).toEqual(['新'])
  })

  it('支持移除字段并保留同一映射中的未知模型属性', () => {
    const source = FM + '## 🤖 @ai\n<!-- @meta\nmodel:\n  id: old\n  x-extra: keep\nreasoning:\n  effort: high\n  x-budget: 100\ntags: [旧]\n-->\n\n正文\n'
    const result = edit(source, { tags: [], modelInfo: { name: '新名称' } })
    const message = first(parseChatlog(result))
    expect(message.modelInfo).toEqual({ name: '新名称' })
    expect(message.meta.model).toEqual({ name: '新名称', 'x-extra': 'keep' })
    expect(message.meta.reasoning).toEqual({ 'x-budget': 100 })
  })

  it('元数据包含 HTML 注释结束文本时仍能完整保存', () => {
    const text = FM + '## 🧑‍💻 @user\n\n正文\n'
    const result = edit(text, { annotations: [{ id: 'a1', text: '写入 --> 后仍然完整' }] })
    expect(first(parseChatlog(result)).annotations?.[0]?.text).toBe('写入 --> 后仍然完整')
  })

  it('输入 0 与未记录有不同语义，并拒绝负值或小数 token', () => {
    const source = FM + '## 🤖 @ai\n<!-- @meta\nusage:\n  input_tokens: 0\n  output_tokens: -1\n  cache_read_tokens: 1.5\n-->\n\n正文\n'
    const doc = parseChatlog(source)
    expect(first(doc).usage?.input_tokens).toBe(0)
    expect(first(doc).usage?.output_tokens).toBeUndefined()
    expect(doc.issues.filter((issue) => issue.rule === 'invalid-token-count')).toHaveLength(2)
    expect(serializeChatlog(doc)).toBe(source)
  })

  it('损坏的 YAML 报错但未编辑时原样保存', () => {
    const source = FM + '## 🧑‍💻 @user\n<!-- @meta\ntags: [坏\n-->\n\n正文\n'
    const doc = parseChatlog(source)
    expect(doc.issues.some((issue) => issue.rule === 'invalid-yaml')).toBe(true)
    expect(serializeChatlog(doc)).toBe(source)
  })

  describe('只改写变化的元数据键', () => {
    // 手写风格：行内列表、对齐注释、引号与块状文字都应逐字保留。
    const meta = [
      '# 整理于周末',
      'id: m-style',
      'tags: [读书, 计划]   # 手写标签',
      'mood: "平静"',
      'annotations:',
      '  - id: note-style',
      '    text: |',
      '      第一行',
      '      第二行',
      'starred: true',
    ]
    const source = (lines: string[]) =>
      FM + '## 🧑‍💻 @user\n<!-- @meta\n' + lines.map((line) => line + '\n').join('') + '-->\n\n正文\n'

    it.each(['LF', 'CRLF'])('%s 下改一个键时，其余键的写法逐字保留', (newline) => {
      const convert = (text: string) => (newline === 'CRLF' ? text.replaceAll('\n', '\r\n') : text)
      const result = edit(convert(source(meta)), { starred: false })
      expect(result).toBe(convert(source(meta.map((line) => line.replace('starred: true', 'starred: false')))))
    })

    it('修改行内列表与带引号的文字时保持原来的风格和行尾注释', () => {
      const result = edit(source(meta), { tags: ['读书', '计划', '散步'], mood: '开心' })
      expect(result).toBe(
        source(
          meta.map((line) =>
            line.startsWith('tags:')
              ? 'tags: [读书, 计划, 散步]   # 手写标签'
              : line.startsWith('mood:')
                ? 'mood: "开心"'
                : line,
          ),
        ),
      )
    })

    it('移除的键连同所在行删除，新增的键追加在末尾', () => {
      const result = edit(source(meta), { tags: undefined, reactions: ['🌱'] })
      const expected = meta.filter((line) => !line.startsWith('tags:'))
      expect(result).toBe(source([...expected, 'reactions:', '  - 🌱']))
      expect(first(parseChatlog(result)).reactions).toEqual(['🌱'])
    })

    it('文档头只改写标题，其余字段与注释保持原样', () => {
      const header = '---\nformat: chatlog-md/2\ntitle: 虚构测试   # 名称\ntimezone: "Asia/Shanghai"\nx-tags: [甲, 乙]\n---\n\n'
      const doc = parseChatlog(header + '## 🧑‍💻 @user\n\n正文\n')
      doc.meta.title = '新的名称'
      expect(serializeChatlog(doc)).toBe(
        header.replace('title: 虚构测试', 'title: 新的名称') + '## 🧑‍💻 @user\n\n正文\n',
      )
    })
  })
})

describe('v2 自包含追加与移动', () => {
  it('无 ID 的消息直接追加，重复日期节保持原顺序', () => {
    const text = FM + '# @2026-09-19\n\n## 🧑‍💻 @user\n\n第一条\n\n# @2026-09-19\n\n## 🤖 @ai\n\n第二条'
    const doc = parseChatlog(text)
    expect(doc.sessions).toHaveLength(2)
    expect(doc.sessions[1]!.messages[0]!.content).toBe('第二条')
    expect(serializeChatlog(doc)).toBe(text)
  })

  it('移动消息不重新编号，保留原片段，自动补足无结尾换行的接缝', () => {
    const text = FM + '# @2026-09-19\n\n## 🧑‍💻 @user\n\n第一条\n\n## 🤖 @ai\n\n第二条'
    const doc = parseChatlog(text)
    doc.sessions[0]!.messages.reverse()
    const after = parseChatlog(serializeChatlog(doc))
    expect(after.sessions[0]!.messages.map((message) => message.content)).toEqual(['第二条', '第一条'])
  })

  it('重复粘贴带 ID 的消息报告冲突但不丢失任何消息', () => {
    const block = '## 🧑‍💻 @user\n<!-- @meta\nid: copied\n-->\n\n内容\n\n'
    const doc = parseChatlog(FM + block + block)
    expect(doc.sessions[0]!.messages).toHaveLength(2)
    expect(doc.issues.some((issue) => issue.rule === 'duplicate-id')).toBe(true)
  })

  it('修改日期元数据和文档标题不影响消息', () => {
    const source = FM + '# @2026-09-19\n\n## 🧑‍💻 @user\n\n  原始空格  \n'
    const doc = parseChatlog(source)
    doc.meta.title = '新标题'
    doc.sessions[0]!.mood = '轻松'
    doc.sessions[0]!.tags = ['旅行']
    const result = parseChatlog(serializeChatlog(doc))
    expect(result.meta.title).toBe('新标题')
    expect(result.sessions[0]!.mood).toBe('轻松')
    expect(first(result)._source!.raw).toBe(first(doc)._source!.raw)
  })
})

describe('v2 有序过程和正文边界', () => {
  const body = '<!-- @part reasoning -->\n<!-- @meta\nlabel: 思考 2 秒\n-->\n第一段推理\n<!-- @endpart -->\n\n<!-- @part commentary -->\n我会查阅资料。\n<!-- @endpart -->\n\n<!-- @part search -->\n<!-- @meta\naction: {type: search, queries: [测试]}\nresults: [{title: 示例, url: "https://example.com"}]\n-->\n<!-- @endpart -->\n\n<!-- @part reasoning -->\n第二段推理\n<!-- @endpart -->\n\n<!-- @part x-future -->\n<!-- @meta\nnested: [1, 2, {enabled: true}]\n-->\n未知过程\n<!-- @endpart -->\n\n<!-- @part answer -->\n最终回答\n<!-- @endpart -->\n'

  it('按实际顺序识别 reasoning/commentary/search/未知块及回答', () => {
    const source = FM + '## 🤖 @ai\n\n' + body
    const message = first(parseChatlog(source))
    expect(message.parts?.map((part) => part.kind)).toEqual(['reasoning', 'commentary', 'search', 'reasoning', 'x-future', 'answer'])
    expect(message.thinking).toEqual({ text: '第一段推理', label: '思考 2 秒' })
    expect(message.content).toBe('最终回答')
    expect(serializeChatlog(parseChatlog(source))).toBe(source)
  })

  it('编辑回答保留全部过程和未知数据', () => {
    const source = FM + '## 🤖 @ai\n\n' + body
    const result = first(parseChatlog(edit(source, { content: '修改后的回答' })))
    expect(result.parts?.map((part) => part.kind)).toEqual(['reasoning', 'commentary', 'search', 'reasoning', 'x-future', 'answer'])
    expect(result.parts?.find((part) => part.kind === 'x-future')?.data?.nested).toEqual([1, 2, { enabled: true }])
    expect(result.content).toBe('修改后的回答')
  })

  it('直接编辑有序块优先，并同步兼容正文', () => {
    const source = FM + '## 🤖 @ai\n\n正文\n'
    const result = first(parseChatlog(edit(source, { parts: [{ kind: 'commentary', text: '说明' }, { kind: 'answer', text: '答案 A' }, { kind: 'reasoning', text: '推理' }, { kind: 'answer', text: '答案 B' }] })))
    expect(result.content).toBe('答案 A\n\n答案 B')
    expect(result.parts).toHaveLength(4)
  })

  it('正文中的标题和块分隔符可转义保存，代码围栏不需要转义', () => {
    const content = '# @2099-01-01\n## 🤖 @ai\n<!-- @part answer -->\n<!-- @endpart -->\n```md\n## 🧑‍💻 @user\n```'
    const source = FM + '## 🧑‍💻 @user\n\n旧正文\n'
    const result = parseChatlog(edit(source, { content }))
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]!.messages).toHaveLength(1)
    expect(first(result).content).toBe(content)
  })

  it('有序块中出现结束标记文本可安全往返', () => {
    const source = FM + '## 🤖 @ai\n\n正文\n'
    const text = '展示标记：\n<!-- @endpart -->\n```md\n<!-- @endpart -->\n```'
    const result = first(parseChatlog(edit(source, { parts: [{ kind: 'answer', text }] })))
    expect(result.content).toBe(text)
  })

  it('附件与相邻文字按原位置形成有序块，附件属性完整写回', () => {
    const source = FM + '## 🧑‍💻 @user\n\n前文\n\n🖼️ [图.png](assets/图.png)\n\n后文\n'
    const message = first(parseChatlog(source))
    expect(message.parts?.map((part) => part.kind)).toEqual(['answer', 'attachment', 'answer'])
    const result = first(parseChatlog(edit(source, { attachments: [{ kind: 'file', name: 'a.pdf', path: 'assets/a.pdf', meta: { size: 123, x: { future: true } } }] })))
    expect(result.attachments).toEqual([{ kind: 'file', name: 'a.pdf', path: 'assets/a.pdf', meta: { size: 123, x: { future: true } } }])
  })

  it('普通 HTML 注释中的过程标记不会被识别', () => {
    const content = '<!-- 注释开始\n<!-- @part search -->\n-->\n文字'
    const message = first(parseChatlog(FM + '## 🧑‍💻 @user\n\n' + content))
    expect(message.parts?.map((part) => part.kind)).toEqual(['answer'])
    expect(message.content).toBe(content)
  })
})

describe('v1 迁移允许变更清单', () => {
  const source = FM.replace('chatlog-md/2', 'chatlog-md/1') + '# @2026-09-19 · 周六\n\n## 🧑‍💻 @user · 2026-09-19\n\n🖼️ [虚构图片.png](assets/fake.png)\n\n  原文  \n\n# @2026-09-20 · 有意义的标题\n\n## 🤖 @ai · old-model\n\n> 🤔 已思考 3s\n>\n> 推理原文\n\n回答\n'

  it.each(['LF', 'CRLF'])('只改变版本与星期标题，%s 原始片段和语义同时核验', (newline) => {
    const text = newline === 'CRLF' ? '\uFEFF' + source.replaceAll('\n', '\r\n') : source
    const migration = migrateV1ToV2(text)
    expect(migration.report).toMatchObject({ ok: true, sessions: 2, messages: 2, thinking: 1, attachments: 1, removedWeekdayTitles: 1, rawFragmentsVerified: 2 })
    expect(migration.text).toBe(text.replace('chatlog-md/1', 'chatlog-md/2').replace(' · 周六', ''))
    expect(parseChatlog(migration.text).sessions[1]!.title).toBe('有意义的标题')
  })

  it('篡改正文空格或丢失游离注释会使核验失败', () => {
    const original = source.replace('# @2026-09-19', '<!-- 原始游离注释 -->\n# @2026-09-19')
    const { text } = migrateV1ToV2(original)
    expect(verifyMigration(original, text.replace('  原文  ', '原文')).ok).toBe(false)
    expect(verifyMigration(original, text.replace('<!-- 原始游离注释 -->\n', '')).ok).toBe(false)
  })

  it.each(['LF', 'CRLF'])('普通 Markdown 转义与结构转义混排时可迁移，%s 原文字节不变', (newline) => {
    const body = String.raw`\# 普通标题
\## 二级标题
\## @custom
\### 三级标题
\\# 已有双斜杠
\# @2026-09-20
\## 🤖 @ai
\📄 `
    const input = FM.replace('chatlog-md/2', 'chatlog-md/1') + '# @2026-09-19 · 周六\n\n## @user\n\n' + body + '\n\n## @ai\n\n下一条消息\n'
    const original = newline === 'CRLF' ? '\uFEFF' + input.replaceAll('\n', '\r\n') : input
    const { text, report } = migrateV1ToV2(original)
    expect(report).toMatchObject({ ok: true, messages: 2, rawFragmentsVerified: 2, failures: [] })
    expect(text).toBe(original.replace('chatlog-md/1', 'chatlog-md/2').replace(' · 周六', ''))
    const before = parseChatlog(original)
    const after = parseChatlog(text)
    expect(first(before).content).toContain('# 普通标题\n## 二级标题')
    expect(first(after).content).toBe(body.replace('\\# @2026-09-20', '# @2026-09-20').replace('\\## 🤖 @ai', '## 🤖 @ai'))
    expect(after.sessions[0]!.messages.map((message) => message._source!.raw)).toEqual(before.sessions[0]!.messages.map((message) => message._source!.raw))
    expect(serializeChatlog(after)).toBe(text)
  })

  it.each([
    ['删除普通 Markdown 反斜杠', '\\# 普通标题', '# 普通标题'],
    ['修改正文文字', '普通标题', '改写标题'],
    ['增加真实结构转义层', '\\# @2026-09-20', '\\\\# @2026-09-20'],
  ])('兼容旧转义仍拒绝%s', (_, from, to) => {
    const original = FM.replace('chatlog-md/2', 'chatlog-md/1') + '## @user\n\n\\# 普通标题\n\\# @2026-09-20\n'
    const { text } = migrateV1ToV2(original)
    const report = verifyMigration(original, text.replace(from, to))
    expect(report.ok).toBe(false)
    expect(report.rawFragmentsVerified).toBe(0)
    expect(report.failures).toContain('存在版本声明、纯星期标题以外的原始字节片段变化')
    expect(report.failures).toContain('日期节 1 消息 1 原始片段变化')
  })

  it('原文未改但普通文字被解释成 v2 内容块时仍拒绝语义变化', () => {
    const original = FM.replace('chatlog-md/2', 'chatlog-md/1') + '## @user\n\n<!-- @part answer -->\n\\# 普通标题\n<!-- @endpart -->\n'
    const { report } = migrateV1ToV2(original)
    expect(report.ok).toBe(false)
    expect(report.rawFragmentsVerified).toBe(1)
    expect(report.failures).toContain('日期节 1 消息 1 字段 content 变化')
  })
})

describe('编辑器与工作区写回回归', () => {
  const source = FM + '# @2026-09-19\n\n## 🧑‍💻 @user\n\n  保留空格  \n\n## 🤖 @ai\n<!-- @meta\nid: answer-original\nmodel:\n  id: synthetic\n  name: 示例\nx-unknown: {nested: [1, 2]}\n-->\n\n> 🤔 思考过\n>\n> 推理文本\n\n回答正文\n\n# @2026-09-20\n'

  it('真实 draft 和 applyMessageEdit 只改 ID、标签时保留整个正文', () => {
    const doc = parseChatlog(source)
    const message = first(doc)
    const draft = createMessageDraft(message, '2026-09-19')
    draft.tags = ['新增标签']
    applyMessageEdit(doc, draft, 0)
    const after = first(parseChatlog(serializeChatlog(doc)))
    expect(after.id).toBeTruthy()
    expect(after.tags).toEqual(['新增标签'])
    expect(after._source!.raw.slice(after._source!.bodyStart)).toBe(message._source!.raw.slice(message._source!.bodyStart))
  })

  it('删除、复制、移动带原始片段的消息不会复制旧日期或旧消息', () => {
    const doc = parseChatlog(source)
    const original = doc.sessions[0]!.messages[1]!
    const copy = { ...structuredClone(original), id: 'copied-message' }
    doc.sessions[0]!.messages = [copy]
    ensureDay(doc, '2026-09-20').messages.push(original)
    const text = serializeChatlog(doc)
    const after = parseChatlog(text)
    expect(after.sessions.map((day) => day.date)).toEqual(['2026-09-19', '2026-09-20'])
    expect(after.sessions.flatMap((day) => day.messages).map((message) => message.id)).toEqual(['copied-message', 'answer-original'])
    expect(text.match(/回答正文/g)).toHaveLength(2)
    expect(text).not.toContain('保留空格')
    expect(serializeChatlog(after)).toBe(text)
  })

  it('在新建无结尾空行的日期下添加消息仅序列化一次', () => {
    const doc = parseChatlog(FM + '# @2026-09-19')
    const draft = createMessageDraft(null, '2026-09-19')
    draft.content = '唯一正文'
    applyMessageEdit(doc, draft)
    const text = serializeChatlog(doc)
    const after = parseChatlog(text)
    expect(after.sessions).toHaveLength(1)
    expect(first(after).content).toBe('唯一正文')
    expect(text.match(/唯一正文/g)).toHaveLength(1)
    expect(serializeChatlog(after)).toBe(text)
  })

  it('添加交错过程后再次编辑单个回答保留所有思考且不重复', () => {
    const doc = parseChatlog(source)
    const original = doc.sessions[0]!.messages[1]!
    const draft = withParts(createMessageDraft(original, '2026-09-19'), [
      { kind: 'reasoning', text: '第一次推理' }, { kind: 'answer', text: '中间回答' },
      { kind: 'commentary', text: '继续检索' }, { kind: 'reasoning', text: '第二次推理' }, { kind: 'answer', text: '最后回答' },
    ])
    applyMessageEdit(doc, draft, 1)
    const written = parseChatlog(serializeChatlog(doc))
    const next = createMessageDraft(written.sessions[0]!.messages[1]!, '2026-09-19')
    applyMessageEdit(written, withParts(next, next.parts!.map((part, index) => index === 4 ? { ...part, text: '修改最后回答' } : part)), 1)
    const result = parseChatlog(serializeChatlog(written)).sessions[0]!.messages[1]!
    expect(result.parts?.map((part) => part.text)).toEqual(['第一次推理', '中间回答', '继续检索', '第二次推理', '修改最后回答'])
    expect(result.thinking?.text).toBe('第一次推理')
    expect(result.content).toBe('中间回答\n\n修改最后回答')
  })

  it('保存复杂常用筛选保留文档未知嵌套字段、注释和所有原始消息', () => {
    const text = source.replace('title: 虚构测试', 'title: 虚构测试\n# 文档注释\nx-future:\n  nested: [null, {keep: true}]')
    const doc = parseChatlog(text)
    const before = doc.sessions.flatMap((day) => day.messages.map((message) => message._source!.raw))
    doc.meta.saved_views = [{ id: 'view-1', name: '读书与批注', filters: { tags: ['读书'], annotated: true }, role: 'user', readMode: 'diary' }]
    const resultText = serializeChatlog(doc)
    const result = parseChatlog(resultText)
    expect(result.meta.saved_views).toEqual(doc.meta.saved_views)
    expect(result.meta['x-future']).toEqual({ nested: [null, { keep: true }] })
    expect(resultText).toContain('# 文档注释')
    expect(result.sessions.flatMap((day) => day.messages.map((message) => message._source!.raw))).toEqual(before)
  })

  it('在同一次编辑中修改过程和附件不会丢失新附件', () => {
    const doc = parseChatlog(FM + '## 🤖 @ai\n\n正文\n\n📄 [旧.pdf](assets/old.pdf)\n')
    const draft = withParts(createMessageDraft(first(doc), '2026-09-19'), [{ kind: 'commentary', text: '新的过程' }, ...first(doc).parts!])
    draft.attachments = [{ kind: 'file', name: '新.pdf', path: 'assets/new.pdf', meta: {} }]
    doc.sessions[0]!.messages[0] = draft
    const after = first(parseChatlog(serializeChatlog(doc)))
    expect(after.attachments).toEqual(draft.attachments)
    expect(after.parts?.filter((part) => part.kind === 'attachment')).toHaveLength(1)
  })
})
