/** v1/v2 共用数据模型；未识别的 YAML 字段留在 meta 中，编辑器不得丢弃。 */

export type Metadata = Record<string, unknown>

export interface Annotation {
  id: string
  text: string
  quote?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface PersonalFields {
  id?: string
  tags?: string[]
  reactions?: string[]
  mood?: string
  states?: string[]
  starred?: boolean
  annotations?: Annotation[]
}

export interface ModelInfo {
  id?: string
  name?: string
  reasoningEffort?: string
}

/** 完整输入包含缓存明细；输出包含推理明细，不重复求和。 */
export interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  reasoning_tokens?: number
  total_tokens?: number
  [key: string]: unknown
}

export interface MessagePart {
  id?: string
  kind: string
  text?: string
  data?: Metadata
  [key: string]: unknown
}

/** 原始片段及语义快照随对象复制保留，用于只改动用户实际编辑的区域。 */
export interface SourceFragment {
  raw: string
  snapshot: string
  headerEnd?: number
  metaStart?: number
  metaEnd?: number
  bodyStart?: number
  headerSnapshot?: string
  metadataSnapshot?: string
  bodySnapshot?: string
  /** 正文内各块的原文范围（统一 LF 后的偏移），只在实际编辑该块时重新生成。 */
  bodyParts?: { start: number; end: number; style: 'plain' | 'attachment' | 'reasoning' | 'explicit' }[]
  yaml?: string
  eol: string
}

export type Role = 'user' | 'ai' | 'system'

export type TimePrecision = 'day' | 'minute' | 'second' | null

export interface Attachment {
  kind: 'image' | 'file'
  /** 显示名（方括号内文本或纯名形的文件名）——真实数据中可能与磁盘路径不同 */
  name: string
  /** 链接目标（相对路径或 URL）；纯名形附件为 null（文件本体不在本地） */
  path: string | null
  meta: Metadata
}

export interface Thinking {
  /** `> 🤔` 之后的自由文本，通常形如「已思考 1m 24s」 */
  label: string
  /** 去掉引用前缀后的思考摘要 Markdown 文本 */
  text: string
}

export interface Message extends PersonalFields {
  role: Role
  /** 消息头里的原始时间戳字符串（三种精度之一），可缺省 */
  time: string | null
  timePrecision: TimePrecision
  model: string | null
  meta: Metadata
  modelInfo?: ModelInfo
  usage?: TokenUsage
  parts?: MessagePart[]
  _source?: SourceFragment
  thinking: Thinking | null
  attachments: Attachment[]
  /** 消息正文（剥离思考块/附件行、还原转义后的 Markdown），原样透传 */
  content: string
  /** 消息头在源文件中的 1-based 行号 */
  line: number
}

export interface Session extends PersonalFields {
  /** `# @YYYY-MM-DD` 的日期；隐式 session 为 null */
  date: string | null
  title: string | null
  meta: Metadata
  _source?: SourceFragment
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
  meta: Metadata & { title?: string; timezone?: string }
  sessions: Session[]
  /** 解析期结构性问题 + lint 检查结果 */
  issues: LintIssue[]
  _source?: SourceFragment
}
