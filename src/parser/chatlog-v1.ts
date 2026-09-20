/**
 * chatlog-md/1 解析器 —— chatlog_parse.py 的 TypeScript 移植。
 *
 * 与 Python 参考实现的行为差异（浏览器端绝不 throw）：
 * - 消息头出现重复时间戳/模型字段 → 记 lint error，保留第一个，继续解析；
 * - 未知角色的消息头形状 → 记 lint error，该行按正文/游离内容处理（与 Python 一致）；
 * - 游离内容不打印 stderr，而是记 lint warn。
 */
import type { Attachment, ChatDoc, LintIssue, Message, Role, Session, Thinking, TimePrecision } from './types'

// 注意：字段分隔符是 U+00B7（·，中点），不是 U+2022（•）/U+30FB（・）——用转义写死防止手滑改错。
const SEP = '·'
// 🖼️ = U+1F5BC + U+FE0F（变体选择符，可选匹配以容忍被剥离的情况）；📄 = U+1F4C4；🤔 = U+1F914。
// astral 码点绝不能放进字符类，必须用分组 + u flag。
const SESSION_RE = /^#\s+@(\d{4}-\d{2}-\d{2})(?:\s*·\s*(.+?))?\s*$/u
const MSG_RE = /^##\s+(?:[^@\r\n]*?)@(user|ai|system)((?:\s*·\s*[^·\r\n]+)*)\s*$/u
const MSG_ANYROLE_RE = /^##\s+(?:[^@\r\n]*?)@([A-Za-z][\w-]*)((?:\s*·\s*[^·\r\n]+)*)\s*$/u
const TS_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/
const META_RE = /^<!--\s*@meta\s+(.*?)\s*-->\s*$/
const META_KV_RE = /(\w+)=("([^"]*)"|\S+)/g
const THINK_RE = /^>\s*\u{1F914}\s*(.*)$/u
const ATTACH_LINK_RE = /^(\u{1F5BC}\uFE0F?|\u{1F4C4})\s+\[([^\]]+)\]\((.*)\)\s*$/u
const ATTACH_NAME_RE = /^(\u{1F5BC}\uFE0F?|\u{1F4C4})\s+(\S.*?)\s*$/u
const ESCAPED_RE = /^\\(#{1,2}\s|>\s*\u{1F914}|\u{1F5BC}\uFE0F? |\u{1F4C4} )/u

const KNOWN_ROLES = new Set(['user', 'ai', 'system'])

interface PendingMessage {
  role: Role
  time: string | null
  model: string | null
  meta: Record<string, string>
  bodyLines: string[]
  line: number
}

function parseKv(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(META_KV_RE)) {
    out[m[1]!] = m[3] !== undefined ? m[3] : m[2]!
  }
  return out
}

/** 消息头 @角色 之后的字段：按形状识别时间/模型（重复时保留第一个并报告） */
function parseHeaderFields(
  rest: string,
  line: number,
  issues: LintIssue[],
): { time: string | null; model: string | null } {
  let time: string | null = null
  let model: string | null = null
  for (const raw of rest.split(SEP)) {
    const tok = raw.trim()
    if (!tok) continue
    if (TS_RE.test(tok)) {
      if (time !== null) {
        issues.push({ level: 'error', rule: 'duplicate-time', line, message: `消息头出现两个时间戳字段：${rest.trim()}` })
        continue
      }
      time = tok
    } else {
      if (model !== null) {
        issues.push({ level: 'error', rule: 'duplicate-model', line, message: `消息头出现两个模型字段：${rest.trim()}` })
        continue
      }
      model = tok
    }
  }
  return { time, model }
}

function timePrecisionOf(t: string | null): TimePrecision {
  if (!t) return null
  if (t.length === 10) return 'day'
  if (t.length === 16) return 'minute'
  return 'second'
}

/** Python str.strip("\n") 等价：仅去掉首尾换行 */
function stripNewlines(s: string): string {
  return s.replace(/^\n+/, '').replace(/\n+$/, '')
}

/** 后处理：去首尾空行，剥离思考块/附件行，还原转义（与 Python finalize 顺序一致） */
function finalize(pending: PendingMessage): Message {
  let lines = pending.bodyLines
  while (lines.length && !lines[0]!.trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()

  // 思考块：必须是正文第一个块
  let thinking: Thinking | null = null
  if (lines.length) {
    const tm = THINK_RE.exec(lines[0]!)
    if (tm) {
      let j = 1
      while (j < lines.length && lines[j]!.startsWith('>')) j++
      const think = lines.slice(1, j).map((ln) => (ln === '>' ? '' : ln.slice(1).replace(/^\s+/, '')))
      thinking = { label: tm[1]!.trim(), text: stripNewlines(think.join('\n')) }
      lines = lines.slice(j)
      while (lines.length && !lines[0]!.trim()) lines.shift()
    }
  }

  // 附件行（可选紧随一行 @meta 附着到该附件）
  const attachments: Attachment[] = []
  const kept: string[] = []
  for (let k = 0; k < lines.length; k++) {
    const ln = lines[k]!
    const lm = ATTACH_LINK_RE.exec(ln)
    const nm = lm ? null : ATTACH_NAME_RE.exec(ln)
    const m2 = lm ?? nm
    if (m2) {
      const att: Attachment = {
        kind: m2[1]!.startsWith('\u{1F5BC}') ? 'image' : 'file',
        name: m2[2]!,
        path: lm ? lm[3]! || null : null,
        meta: {},
      }
      if (k + 1 < lines.length) {
        const am = META_RE.exec(lines[k + 1]!)
        if (am) {
          Object.assign(att.meta, parseKv(am[1]!))
          k++
        }
      }
      attachments.push(att)
    } else {
      kept.push(ln.replace(ESCAPED_RE, (m) => m.slice(1)))
    }
  }

  return {
    role: pending.role,
    time: pending.time,
    timePrecision: timePrecisionOf(pending.time),
    model: pending.model,
    meta: pending.meta,
    thinking,
    attachments,
    content: stripNewlines(kept.join('\n')),
    line: pending.line,
  }
}

function parseFrontMatter(lines: string[], start: number): { meta: Record<string, string>; next: number } {
  const meta: Record<string, string> = {}
  let i = start
  if (i < lines.length && lines[i]!.trim() === '---') {
    i++
    while (i < lines.length && lines[i]!.trim() !== '---') {
      const ln = lines[i]!.trim()
      if (ln && ln.includes(':') && !ln.startsWith('#')) {
        const colon = ln.indexOf(':')
        meta[ln.slice(0, colon).trim()] = ln.slice(colon + 1).trim()
      }
      i++
    }
    i++ // 跳过结尾 ---
  }
  return { meta, next: i }
}

export function parseChatlogV1(text: string): ChatDoc {
  // Windows 环境常见：去 BOM、容忍 CRLF
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const issues: LintIssue[] = []
  const fm = parseFrontMatter(lines, 0)
  const meta = fm.meta
  const format = meta['format'] ?? null
  delete meta['format']
  const doc: ChatDoc = { format, meta, sessions: [], issues }

  let curSession: Session | null = null
  let curMsg: PendingMessage | null = null
  // @meta 附着目标：最近一次出现的日期节 / 消息（附件级 @meta 在 finalize 中处理）
  let lastObj: Session | PendingMessage | null = null

  const closeMsg = () => {
    if (curMsg !== null) {
      curSession!.messages.push(finalize(curMsg))
      curMsg = null
    }
  }
  const ensureSession = (date: string | null, title: string | null, line: number) => {
    curSession = { date, title, meta: {}, messages: [], line }
    doc.sessions.push(curSession)
  }

  for (let i = fm.next; i < lines.length; i++) {
    const ln = lines[i]!
    const lineNo = i + 1
    const sm = SESSION_RE.exec(ln)
    const mm = sm ? null : MSG_RE.exec(ln)
    const km = sm || mm ? null : META_RE.exec(ln)
    if (sm) {
      closeMsg()
      ensureSession(sm[1]!, sm[2]?.trim() ?? null, lineNo)
      lastObj = curSession
    } else if (mm) {
      closeMsg()
      if (curSession === null) ensureSession(null, null, lineNo) // 隐式 session
      const { time, model } = parseHeaderFields(mm[2] ?? '', lineNo, issues)
      curMsg = { role: mm[1] as Role, time, model, meta: {}, bodyLines: [], line: lineNo }
      lastObj = curMsg
    } else if (km && (curMsg === null || curMsg.bodyLines.length === 0)) {
      // 与 Python 行为一致：@meta 只在消息正文开始前被识别，之后按正文透传
      Object.assign((lastObj ?? doc).meta, parseKv(km[1]!))
    } else if (curMsg !== null) {
      curMsg.bodyLines.push(ln)
    } else if (ln.trim()) {
      // 未知角色的消息头形状单独报告，便于发现笔误（如 @assistant）
      const ar = MSG_ANYROLE_RE.exec(ln)
      if (ar && !KNOWN_ROLES.has(ar[1]!)) {
        issues.push({ level: 'error', rule: 'unknown-role', line: lineNo, message: `未知角色 @${ar[1]}：${ln.slice(0, 50)}` })
      } else {
        issues.push({ level: 'warn', rule: 'loose-content', line: lineNo, message: `游离于任何消息之外的内容：${ln.slice(0, 50)}` })
      }
    }
  }
  closeMsg()
  return doc
}

/** 供 lint 与测试复用的正则出口 */
export const RE = { SESSION_RE, MSG_RE, MSG_ANYROLE_RE, TS_RE, META_RE, THINK_RE, ATTACH_LINK_RE, ATTACH_NAME_RE, ESCAPED_RE }
export { KNOWN_ROLES }

