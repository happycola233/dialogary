/** 格式规范 §13 的 lint 检查（解析期结构性问题已由 parseChatlog 记入 doc.issues） */
import { RE } from './chatlog'
import type { ChatDoc, LintIssue } from './types'

/** §11：不同精度的时间戳按公共前缀比较（字符串比较对 ISO 格式成立） */
function prefixCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  const pa = a.slice(0, n)
  const pb = b.slice(0, n)
  return pa < pb ? -1 : pa > pb ? 1 : 0
}

/** 疑似未转义哨兵的正文行（消息头/日期节形状；附件与思考块已在解析时被剥离，无需查） */
const SUSPECT_MSG_RE = /^##\s+[^@\r\n]*@[A-Za-z]/
const SUSPECT_SESSION_RE = /^#\s+@\d{4}-/

export function lintChatDoc(doc: ChatDoc): LintIssue[] {
  const issues: LintIssue[] = []
  let prevTime: string | null = null
  let prevLine = 0

  for (const session of doc.sessions) {
    for (const msg of session.messages) {
      if (msg.time) {
        if (prevTime && prefixCompare(msg.time, prevTime) < 0) {
          issues.push({
            level: 'warn',
            rule: 'time-order',
            line: msg.line,
            message: `时间戳 ${msg.time} 早于上文 ${prevTime}（行${prevLine}），违反单调不减约定`,
          })
        }
        prevTime = msg.time
        prevLine = msg.line

        if (session.date && msg.time.slice(0, 10) !== session.date) {
          issues.push({
            level: 'warn',
            rule: 'date-mismatch',
            line: msg.line,
            message: `消息日期 ${msg.time.slice(0, 10)} 与所在日期节 ${session.date} 不一致`,
          })
        }
      }

      if (msg.model && msg.role !== 'ai') {
        issues.push({
          level: 'warn',
          rule: 'model-on-non-ai',
          line: msg.line,
          message: `@${msg.role} 消息带模型字段「${msg.model}」`,
        })
      }

      if (!msg.content && msg.attachments.length === 0 && !msg.thinking) {
        issues.push({ level: 'info', rule: 'empty-message', line: msg.line, message: '空正文消息' })
      }

      // 正文里残留的哨兵形状行：能留在 content 里说明解析器没把它当哨兵，
      // 多半是想当正文却忘了转义，或角色/日期拼写有误
      let offset = 0
      for (const bodyLine of msg.content.split('\n')) {
        offset++
        if (SUSPECT_MSG_RE.test(bodyLine) || SUSPECT_SESSION_RE.test(bodyLine) || RE.ATTACH_NAME_RE.test(bodyLine)) {
          issues.push({
            level: 'warn',
            rule: 'suspect-sentinel',
            line: msg.line,
            message: `正文疑似未转义的哨兵（消息内第${offset}行）：${bodyLine.slice(0, 50)}`,
          })
        }
      }
    }
  }
  return issues
}
