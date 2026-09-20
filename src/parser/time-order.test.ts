import { describe, expect, it } from 'vitest'
import { parseChatlog, serializeChatlog } from './chatlog'
import { lintChatDoc } from './lint'

const unordered = `---
format: chatlog-md/2
---

# @2026-09-20

## @user · 2026-09-20 12:00

中午的记录

## @ai · 2026-09-20 11:00

补记较早的对话

# @2026-09-19

## @user · 2026-09-19

补记昨天
`

describe('时间顺序', () => {
  it('v2 接受倒序日期与当天非单调时间，保留文件顺序且无误报', () => {
    const doc = parseChatlog(unordered)
    expect(doc.issues).toEqual([])
    expect(lintChatDoc(doc)).toEqual([])
    expect(doc.sessions.map((session) => session.date)).toEqual(['2026-09-20', '2026-09-19'])
    expect(
      doc.sessions.flatMap((session) => session.messages.map((message) => message.time)),
    ).toEqual(['2026-09-20 12:00', '2026-09-20 11:00', '2026-09-19'])
    expect(serializeChatlog(doc)).toBe(unordered)
  })

  it('保留 v1 对递增时间的语义提醒', () => {
    const doc = parseChatlog(unordered.replace('chatlog-md/2', 'chatlog-md/1'))
    expect(lintChatDoc(doc).filter((issue) => issue.rule === 'time-order')).toHaveLength(2)
  })
})
