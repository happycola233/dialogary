/** 语义检查；结构与 YAML 错误由 parseChatlog 定位，任何诊断都不改写原文。 */
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
        // v2 允许补记、剪贴与重排，文件顺序本身就是阅读顺序；时间递增只保留为 v1 约定。
        if (doc.format !== 'chatlog-md/2' && prevTime && prefixCompare(msg.time, prevTime) < 0) {
          issues.push({
            level: 'warn',
            rule: 'time-order',
            line: msg.line,
            message: `时间戳 ${msg.time} 早于上文 ${prevTime}（行${prevLine}）`,
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

      if ((msg.model || msg.modelInfo?.id || msg.modelInfo?.name) && msg.role !== 'ai') {
        issues.push({
          level: 'warn',
          rule: 'model-on-non-ai',
          line: msg.line,
          message: `@${msg.role} 消息带模型字段「${msg.model ?? msg.modelInfo?.name ?? msg.modelInfo?.id}」`,
        })
      }

      if (!msg.content && msg.attachments.length === 0 && !msg.thinking && !msg.parts?.length) {
        issues.push({ level: 'info', rule: 'empty-message', line: msg.line, message: '空正文消息' })
      }

      if (msg.usage) {
        const { input_tokens: input, output_tokens: output, total_tokens: total, reasoning_tokens: reasoning, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite } = msg.usage
        if (input !== undefined && output !== undefined && total !== undefined && total !== input + output) {
          issues.push({ level: 'warn', rule: 'usage-total-mismatch', line: msg.line, message: `记录的总量 ${total} 与输入、输出合计 ${input + output} 不一致；原始数值已保留。` })
        }
        if (reasoning !== undefined && output !== undefined && reasoning > output) {
          issues.push({ level: 'warn', rule: 'reasoning-exceeds-output', line: msg.line, message: '推理 token 超过完整输出量，请检查导入时的统计口径。' })
        }
        if (input !== undefined && ((cacheRead ?? 0) > input || (cacheWrite ?? 0) > input)) {
          issues.push({ level: 'warn', rule: 'cache-exceeds-input', line: msg.line, message: '缓存明细超过完整输入量，请检查导入时的统计口径。' })
        }
      }

      // v2 的围栏和显式块允许这些字面文本；还原转义后不能再据此误报。
      if (doc.format === 'chatlog-md/2') continue

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
