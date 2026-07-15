/** chatlog-md/1 数据模型（与格式规范 §12 的 JSON 映射对应） */

export type Role = 'user' | 'ai' | 'system'

export type TimePrecision = 'day' | 'minute' | 'second' | null

export interface Attachment {
  kind: 'image' | 'file'
  /** 显示名（方括号内文本或纯名形的文件名）——真实数据中可能与磁盘路径不同 */
  name: string
  /** 链接目标（相对路径或 URL）；纯名形附件为 null（文件本体不在本地） */
  path: string | null
  meta: Record<string, string>
}

export interface Thinking {
  /** `> 🤔` 之后的自由文本，通常形如「已思考 1m 24s」 */
  label: string
  /** 去掉引用前缀后的思考摘要 Markdown 文本 */
  text: string
}

export interface Message {
  role: Role
  /** 消息头里的原始时间戳字符串（三种精度之一），可缺省 */
  time: string | null
  timePrecision: TimePrecision
  model: string | null
  meta: Record<string, string>
  thinking: Thinking | null
  attachments: Attachment[]
  /** 消息正文（剥离思考块/附件行、还原转义后的 Markdown），原样透传 */
  content: string
  /** 消息头在源文件中的 1-based 行号 */
  line: number
}

export interface Session {
  /** `# @YYYY-MM-DD` 的日期；隐式 session 为 null */
  date: string | null
  title: string | null
  meta: Record<string, string>
  messages: Message[]
  /** 日期节头的 1-based 行号；隐式 session 为其首条消息的行号 */
  line: number
}

export type LintLevel = 'error' | 'warn' | 'info'

export interface LintIssue {
  level: LintLevel
  rule: string
  /** 1-based 源文件行号，无法定位时为 0 */
  line: number
  message: string
}

export interface ChatDoc {
  format: string | null
  meta: Record<string, string>
  sessions: Session[]
  /** 解析期结构性问题 + lint 检查结果 */
  issues: LintIssue[]
}
