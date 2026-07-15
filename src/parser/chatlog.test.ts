import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseChatlog } from './chatlog'
import { lintChatDoc } from './lint'

const FM = `---\nformat: chatlog-md/1\ntitle: 测试\ntimezone: Asia/Shanghai\n---\n`

describe('front matter', () => {
  it('解析必备键并把 format 提出', () => {
    const doc = parseChatlog(FM)
    expect(doc.format).toBe('chatlog-md/1')
    expect(doc.meta).toEqual({ title: '测试', timezone: 'Asia/Shanghai' })
  })

  it('容忍 BOM 与 CRLF', () => {
    const doc = parseChatlog('﻿' + FM.replaceAll('\n', '\r\n') + '# @2025-01-01\r\n\r\n## 🧑‍💻 @user\r\n\r\n你好\r\n')
    expect(doc.format).toBe('chatlog-md/1')
    expect(doc.sessions[0]?.messages[0]?.content).toBe('你好')
  })
})

describe('日期节与消息头', () => {
  const doc = parseChatlog(
    FM +
      `
# @2025-03-28 · 周五

## 🧑‍💻 @user · 2025-03-28 23:04:06

今天好累

## 🤖 @ai · 2025-03-28 23:04:19 · gpt-5-1-thinking

**抱抱你**

## 🤖 @ai · gpt-5-1-thinking · 2025-03-28 23:05

字段按形状识别，顺序无关

## 🧑‍💻 @user

（无时间戳合法；同角色连续也合法）

# @2025-03-29

## 🤖 @ai · 2025-03-29

日精度
`,
  )
  const [s1, s2] = doc.sessions

  it('日期节：日期、标题、隐式标题为 null', () => {
    expect(doc.sessions).toHaveLength(2)
    expect(s1?.date).toBe('2025-03-28')
    expect(s1?.title).toBe('周五')
    expect(s2?.title).toBeNull()
  })

  it('角色、时间、模型与三种精度', () => {
    const [m1, m2, m3, m4] = s1!.messages
    expect(m1).toMatchObject({ role: 'user', time: '2025-03-28 23:04:06', timePrecision: 'second', model: null })
    expect(m2).toMatchObject({ role: 'ai', model: 'gpt-5-1-thinking', timePrecision: 'second' })
    expect(m3).toMatchObject({ model: 'gpt-5-1-thinking', time: '2025-03-28 23:05', timePrecision: 'minute' })
    expect(m4).toMatchObject({ role: 'user', time: null, timePrecision: null })
    expect(s2!.messages[0]).toMatchObject({ timePrecision: 'day' })
  })

  it('正文中的 H1/H2 不是哨兵', () => {
    const doc2 = parseChatlog(FM + `## 🧑‍💻 @user\n\n# 正文一级标题\n\n## 正文二级标题\n\n完`)
    expect(doc2.sessions).toHaveLength(1)
    expect(doc2.sessions[0]!.messages).toHaveLength(1)
    expect(doc2.sessions[0]!.messages[0]!.content).toContain('# 正文一级标题')
  })

  it('消息先于任何日期节 → 隐式 session', () => {
    const doc2 = parseChatlog(FM + `## 🧑‍💻 @user\n\n你好`)
    expect(doc2.sessions[0]).toMatchObject({ date: null, title: null })
  })
})

describe('思考块', () => {
  it('剥离首块思考并保留 label 与文本', () => {
    const doc = parseChatlog(
      FM +
        `## 🤖 @ai

> 🤔 已思考 1m 24s
>
> **理解情绪**
> 用户很疲惫……

正文开始`,
    )
    const m = doc.sessions[0]!.messages[0]!
    expect(m.thinking).toEqual({ label: '已思考 1m 24s', text: '**理解情绪**\n用户很疲惫……' })
    expect(m.content).toBe('正文开始')
  })

  it('正文中间的 🤔 引用块不是思考块', () => {
    const doc = parseChatlog(FM + `## 🤖 @ai\n\n正文\n\n> 🤔 这只是普通引用\n`)
    const m = doc.sessions[0]!.messages[0]!
    expect(m.thinking).toBeNull()
    expect(m.content).toContain('> 🤔 这只是普通引用')
  })
})

describe('附件', () => {
  it('链接形与纯名形，显示名与路径分离', () => {
    const doc = parseChatlog(
      FM +
        `## 🧑‍💻 @user

🖼️ [1000078140.jpg](assets/20260530_225635_03.jpg)
🖼️ 1000078148.jpg
📄 成绩单.pdf
嘿嘿`,
    )
    const m = doc.sessions[0]!.messages[0]!
    expect(m.attachments).toEqual([
      { kind: 'image', name: '1000078140.jpg', path: 'assets/20260530_225635_03.jpg', meta: {} },
      { kind: 'image', name: '1000078148.jpg', path: null, meta: {} },
      { kind: 'file', name: '成绩单.pdf', path: null, meta: {} },
    ])
    expect(m.content).toBe('嘿嘿')
  })

  it('路径含括号（贪婪到行尾右括号）与无变体选择符的 🖼', () => {
    const doc = parseChatlog(FM + `## 🧑‍💻 @user\n\n🖼️ [image(57).png](assets/image(57).png)\n\u{1F5BC} plain.png\n`)
    const [a1, a2] = doc.sessions[0]!.messages[0]!.attachments
    expect(a1?.path).toBe('assets/image(57).png')
    expect(a2?.name).toBe('plain.png')
  })

  it('附件行下一行的 @meta 附着到该附件', () => {
    const doc = parseChatlog(FM + `## 🧑‍💻 @user\n\n看图\n\n🖼️ [a.jpg](assets/a.jpg)\n<!-- @meta w=4098 h=2481 -->\n`)
    const m = doc.sessions[0]!.messages[0]!
    expect(m.attachments[0]?.meta).toEqual({ w: '4098', h: '2481' })
    expect(m.content).toBe('看图')
  })
})

describe('@meta 归属（复刻 Python 行为）', () => {
  it('依次附着到日期节 / 消息（仅在正文开始前）', () => {
    const doc = parseChatlog(
      FM +
        `# @2025-12-05 · 周五
<!-- @meta platform=ChatGPT account="main one" -->

## 🧑‍💻 @user · 2025-12-05 01:20:11
<!-- @meta starred=true tags=日记,考试 -->

正文
<!-- @meta not=meta -->`,
    )
    const s = doc.sessions[0]!
    expect(s.meta).toEqual({ platform: 'ChatGPT', account: 'main one' })
    const m = s.messages[0]!
    expect(m.meta).toEqual({ starred: 'true', tags: '日记,考试' })
    // 正文开始后的 @meta 行按正文透传
    expect(m.content).toContain('<!-- @meta not=meta -->')
  })
})

describe('转义与游离内容', () => {
  it('行首反斜杠还原哨兵形状的正文', () => {
    const doc = parseChatlog(FM + `## 🧑‍💻 @user\n\n\\## @user 这行是正文\n\\🖼️ 这行也是正文\n`)
    const m = doc.sessions[0]!.messages[0]!
    expect(m.content).toBe('## @user 这行是正文\n🖼️ 这行也是正文')
    expect(m.attachments).toHaveLength(0)
  })

  it('游离内容与未知角色记入 issues', () => {
    const doc = parseChatlog(FM + `游离的一行\n\n## 🤖 @assistant · 2025-01-01\n`)
    expect(doc.issues.some((i) => i.rule === 'loose-content')).toBe(true)
    expect(doc.issues.some((i) => i.rule === 'unknown-role' && i.level === 'error')).toBe(true)
    expect(doc.sessions).toHaveLength(0)
  })

  it('重复时间戳字段 → error 且保留第一个', () => {
    const doc = parseChatlog(FM + `## 🤖 @ai · 2025-01-01 10:00 · 2025-01-01 11:00\n\n嗯`)
    expect(doc.issues.some((i) => i.rule === 'duplicate-time')).toBe(true)
    expect(doc.sessions[0]!.messages[0]!.time).toBe('2025-01-01 10:00')
  })
})

describe('lint', () => {
  it('时间倒序 / 日期不一致 / 非 ai 带模型 / 空消息 / 疑似哨兵', () => {
    const doc = parseChatlog(
      FM +
        `# @2025-01-02

## 🤖 @ai · 2025-01-02 10:00

早

## 🧑‍💻 @user · 2025-01-01 09:00 · some-model

## 🤖 @ai · 2025-01-03 01:00

## @user 忘了转义的一行`,
    )
    const rules = lintChatDoc(doc).map((i) => i.rule)
    expect(rules).toContain('time-order')
    expect(rules).toContain('date-mismatch')
    expect(rules).toContain('model-on-non-ai')
    expect(rules).toContain('empty-message')
    expect(rules).toContain('suspect-sentinel')
  })

  it('不同精度前缀比较不误报', () => {
    const doc = parseChatlog(FM + `# @2025-02-17\n\n## 🧑‍💻 @user · 2025-02-17\n\n早\n\n## 🤖 @ai · 2025-02-17 21:04\n\n晚`)
    expect(lintChatDoc(doc).filter((i) => i.rule === 'time-order')).toHaveLength(0)
  })
})

describe('golden：真实聊天记录', () => {
  const candidates = [
    process.env['CHATLOG_FILE'],
    ...(fs.existsSync('public/data')
      ? fs
          .readdirSync('public/data')
          .filter((f) => f.endsWith('.chat.md'))
          .map((f) => path.join('public/data', f))
      : []),
  ].filter((p): p is string => !!p && fs.existsSync(p))

  it.skipIf(candidates.length === 0)('统计数字与 Python 参考解析器一致', () => {
    const doc = parseChatlog(fs.readFileSync(candidates[0]!, 'utf8'))
    const msgs = doc.sessions.flatMap((s) => s.messages)
    const by = <K>(keys: K[]) => {
      const m = new Map<K, number>()
      for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
      return Object.fromEntries([...m].map(([k, v]) => [String(k), v]))
    }
    expect(doc.format).toBe('chatlog-md/1')
    expect(doc.sessions).toHaveLength(72)
    expect(msgs).toHaveLength(333)
    expect(by(msgs.map((m) => m.role))).toEqual({ user: 162, ai: 171 })
    expect(by(msgs.map((m) => m.timePrecision))).toEqual({ day: 2, null: 50, second: 275, minute: 6 })
    expect(msgs.filter((m) => m.model).length).toBe(43)
    expect(msgs.filter((m) => m.thinking).length).toBe(42)
    expect(msgs.reduce((n, m) => n + m.attachments.length, 0)).toBe(19)
    // 真实文件应当没有结构性 error
    expect(doc.issues.filter((i) => i.level === 'error')).toEqual([])
  })
})
