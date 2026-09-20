import { parseDocument, stringify } from 'yaml'
import { serializeBodyParts } from './bodySerialization'
import { syncAttachmentParts } from './attachmentParts'
import { parseChatlogV1, RE, KNOWN_ROLES } from './chatlog-v1'
import type { Annotation, Attachment, ChatDoc, LintIssue, Message, MessagePart, Metadata, PersonalFields, Session, SourceFragment } from './types'

export { RE, KNOWN_ROLES }

const META_START = /^<!--\s*@meta\s*$/
const PART_START = /^<!--\s*@part\s+([a-zA-Z][\w.-]*)\s*-->\s*$/
const PART_END = /^<!--\s*@endpart\s*-->\s*$/
const PART_LITERAL = /^<!--\s*@(?:part|endpart|meta)\b/
const COMMENT_START = /^ {0,3}<!--/
const personalKeys = ['id', 'tags', 'reactions', 'mood', 'states', 'starred', 'annotations'] as const
const weekday = /^(?:周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i

interface Line { text: string; start: number; end: number }
interface Structure { lines: Line[]; heads: { index: number; kind: 'session' | 'message' }[]; frontEnd: number }
interface Fence { char: string; length: number }

function openingFence(line: string): Fence | null {
  const token = /^ {0,3}(`{3,}|~{3,})/.exec(line)
  if (!token || (token[1]![0] === '`' && line.slice(token[0].length).includes('`'))) return null
  return { char: token[1]![0]!, length: token[1]!.length }
}

function closesFence(line: string, fence: Fence): boolean {
  const token = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1]
  return !!token && token[0] === fence.char && token.length >= fence.length
}

/** 写入增加一层、读取剥去一层；已有反斜杠不能被吞掉，也不能不断累加。 */
function transformSentinel(line: string, explicit: boolean, encode: boolean): string {
  const literal = line.replace(/^\\+/, '')
  const sentinel = PART_LITERAL.test(literal) || (!explicit && (
    RE.SESSION_RE.test(literal) || RE.MSG_RE.test(literal) ||
    RE.ATTACH_NAME_RE.test(literal) || RE.THINK_RE.test(literal)
  ))
  if (!sentinel) return line
  if (encode) return `\\${line}`
  return line.startsWith('\\') ? line.slice(1) : line
}

/** 围栏和真正的 HTML 注释内没有结构转义，必须连已有反斜杠一起保留。 */
function transformText(text: string, explicit: boolean, encode: boolean): string {
  let fence: Fence | null = null
  let comment = false
  return text.split('\n').map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null
      return line
    }
    if (comment) {
      if (line.includes('-->')) comment = false
      return line
    }
    fence = openingFence(line)
    if (fence) return line
    const result = transformSentinel(line, explicit, encode)
    // 读入时看转义前的原行，不能把还原出的字面 @meta 当成注释起点。
    const structural = encode ? result : line
    if (COMMENT_START.test(structural) && !structural.includes('-->')) comment = true
    return result
  }).join('\n')
}

const json = (value: unknown) => JSON.stringify(value)
const cleanText = (value: string) => value.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')
const isRecord = (value: unknown): value is Metadata => value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): string[] | undefined => Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined
const eolOf = (text: string) => text.includes('\r\n') ? '\r\n' : '\n'

function linesOf(text: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0]) continue
    const raw = match[0]
    lines.push({ text: raw.replace(/\r?\n$/, '').replace(start === 0 ? /^\uFEFF/ : /$^/, ''), start, end: start + raw.length })
    start += raw.length
  }
  return lines
}

/** 标记只能出现在 Markdown 顶层；围栏、HTML 注释和过程块内部的标题都是正文。 */
function structureOf(text: string, issues: LintIssue[] = []): Structure {
  const lines = linesOf(text)
  let frontEnd = 0
  let start = 0
  if (lines[0]?.text.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.text.trim() === '---')
    if (end >= 0) { frontEnd = lines[end]!.end; start = end + 1 }
  }
  const heads: Structure['heads'] = []
  let fence: Fence | null = null
  let fenceLine = 0
  let comment = false
  let commentLine = 0
  let part = false
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!.text
    if (fence) {
      if (closesFence(line, fence)) fence = null
      continue
    }
    if (comment) { if (line.includes('-->')) comment = false; continue }
    fence = openingFence(line)
    if (fence) { fenceLine = i + 1; continue }
    if (PART_START.test(line)) { part = true; continue }
    if (PART_END.test(line)) { part = false; continue }
    if (COMMENT_START.test(line) && !line.includes('-->')) { comment = true; commentLine = i + 1; continue }
    if (part) continue
    if (RE.SESSION_RE.test(line)) heads.push({ index: i, kind: 'session' })
    else if (RE.MSG_RE.test(line)) heads.push({ index: i, kind: 'message' })
  }
  // 未闭合内容可能包含“消息头”代码示例；只能报告并保留原文，不能猜测分割位置。
  if (fence) issues.push({ level: 'error', rule: 'unclosed-fence', line: fenceLine, message: '代码围栏缺少结束标记，后续内容仍属于该围栏；原文已完整保留。' })
  if (comment) issues.push({ level: 'error', rule: 'unclosed-comment', line: commentLine, message: 'HTML 注释缺少结束标记 -->，后续内容仍属于该注释；原文已完整保留。' })
  return { lines, heads, frontEnd }
}

function readYaml(text: string, issues: LintIssue[], line: number): Metadata {
  const doc = parseDocument(text, { uniqueKeys: true })
  for (const error of doc.errors) issues.push({ level: 'error', rule: 'invalid-yaml', line, message: error.message })
  if (doc.errors.length) return {}
  try {
    const value: unknown = doc.toJS({ maxAliasCount: 100 })
    if (value == null) return {}
    if (isRecord(value)) {
      // chatlog 扩展必须能进入 JSON 数据模型；循环 YAML 别名属于输入边界错误。
      json(value)
      return value
    }
    issues.push({ level: 'error', rule: 'metadata-object', line, message: '元数据需要使用 YAML 键值映射。' })
  } catch (error) {
    issues.push({ level: 'error', rule: 'invalid-yaml', line, message: String(error) })
  }
  return {}
}

function personal(meta: Metadata): PersonalFields {
  const fields: PersonalFields = {}
  if (typeof meta.id === 'string') fields.id = meta.id
  if (strings(meta.tags)) fields.tags = strings(meta.tags)
  if (strings(meta.reactions)) fields.reactions = strings(meta.reactions)
  if (typeof meta.mood === 'string') fields.mood = meta.mood
  if (strings(meta.states)) fields.states = strings(meta.states)
  if (typeof meta.starred === 'boolean') fields.starred = meta.starred
  if (Array.isArray(meta.annotations)) fields.annotations = meta.annotations.filter((v): v is Annotation => isRecord(v) && typeof v.id === 'string' && typeof v.text === 'string')
  return fields
}

function semantic(object: Message | Session | ChatDoc): string {
  const { _source, ...rest } = object
  void _source
  return json(rest)
}

function normalizedMetadata(object: Message | Session): Metadata {
  const result: Metadata = {}
  for (const key of personalKeys) if (object[key] !== undefined) result[key] = object[key]
  if ('role' in object) {
    if (object.modelInfo !== undefined) result.modelInfo = object.modelInfo
    if (object.usage !== undefined) result.usage = object.usage
  }
  return result
}

function headerData(object: Message | Session): unknown {
  return 'role' in object ? [object.role, object.time, object.model] : [object.date, object.title]
}
function bodyData(message: Message): unknown {
  return { content: message.content, thinking: message.thinking, attachments: message.attachments, parts: message.parts }
}
function metadataData(object: Message | Session): unknown { return { meta: object.meta, normalized: normalizedMetadata(object) } }

function readLeadingMeta(raw: string, issues: LintIssue[], lineNumber: number): { meta: Metadata; source: SourceFragment } {
  const lines = linesOf(raw)
  const source: SourceFragment = { raw, snapshot: '', headerEnd: lines[0]?.end ?? 0, bodyStart: lines[0]?.end ?? 0, eol: eolOf(raw) }
  let index = 1
  while (index < lines.length && !lines[index]!.text.trim()) index++
  const line = lines[index]
  if (line && META_START.test(line.text)) {
    let end = index + 1
    while (end < lines.length && lines[end]!.text.trim() !== '-->') end++
    if (end === lines.length) {
      issues.push({ level: 'error', rule: 'unclosed-meta', line: lineNumber + index, message: '元数据注释缺少结束标记 -->。' })
      return { meta: {}, source }
    }
    source.metaStart = line.start
    source.metaEnd = lines[end]!.end
    source.bodyStart = source.metaEnd
    source.yaml = raw.slice(line.end, lines[end]!.start)
    return { meta: readYaml(source.yaml, issues, lineNumber + index + 1), source }
  }
  if (line && RE.META_RE.test(line.text)) {
    const meta: Metadata = {}
    for (const match of line.text.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) meta[match[1]!] = match[3] ?? match[2]
    source.metaStart = line.start; source.metaEnd = line.end; source.bodyStart = line.end
    return { meta, source }
  }
  return { meta: {}, source }
}

/** 兼容 v1 的人类可读附件语法；只在围栏以外识别。 */
function parseBody(raw: string, issues: LintIssue[], lineNumber: number, source?: SourceFragment): Pick<Message, 'content' | 'thinking' | 'attachments' | 'parts'> {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) { offsets.push(offset); offset += line.length + 1 }
  let firstLine = 0
  let lastLine = lines.length
  while (firstLine < lastLine && !lines[firstLine]!.trim()) firstLine++
  while (lastLine > firstLine && !lines[lastLine - 1]!.trim()) lastLine--
  const fragments: NonNullable<SourceFragment['bodyParts']> = []
  if (source) source.bodyParts = fragments
  const parts: MessagePart[] = []
  const attachments: Attachment[] = []
  let thinking: Message['thinking'] = null
  let answer: string[] = []
  let answerStart = firstLine
  const answers: string[] = []
  const legacyContent: string[] = []
  let hasExplicitParts = false
  let fence: Fence | null = null
  let comment = false
  const append = (part: MessagePart, start: number, end: number, style: NonNullable<SourceFragment['bodyParts']>[number]['style']) => {
    parts.push(part)
    fragments.push({ start: offsets[start]!, end: offsets[end - 1]! + lines[end - 1]!.length, style })
  }
  const flush = () => {
    const text = cleanText(answer.join('\n'))
    if (text) {
      let start = 0
      let end = answer.length
      while (!answer[start]) start++
      while (!answer[end - 1]) end--
      append({ kind: 'answer', text }, answerStart + start, answerStart + end, 'plain')
      answers.push(text)
    }
    answer = []
  }
  for (let i = firstLine; i < lastLine; i++) {
    if (!answer.length) answerStart = i
    const line = lines[i]!
    if (comment) {
      answer.push(line); legacyContent.push(line)
      if (line.includes('-->')) comment = false
      continue
    }
    if (fence) {
      answer.push(line)
      legacyContent.push(line)
      if (closesFence(line, fence)) fence = null
      continue
    }
    fence = openingFence(line)
    if (fence) { answer.push(line); legacyContent.push(line); continue }
    const start = PART_START.exec(line)
    if (start) {
      hasExplicitParts = true
      flush()
      let end = i + 1
      let partFence: Fence | null = null
      let partComment = false
      for (; end < lines.length; end++) {
        const current = lines[end]!
        if (partFence) {
          if (closesFence(current, partFence)) partFence = null
          continue
        }
        if (partComment) { if (current.includes('-->')) partComment = false; continue }
        partFence = openingFence(current)
        if (partFence) continue
        if (COMMENT_START.test(current) && !current.includes('-->')) { partComment = true; continue }
        if (PART_END.test(current)) break
      }
      if (end === lines.length) {
        issues.push({ level: 'error', rule: 'unclosed-part', line: lineNumber + i, message: `过程块 ${start[1]} 缺少 @endpart。` })
        answerStart = i; answer.push(...lines.slice(i)); break
      }
      const partRaw = ['header', ...lines.slice(i + 1, end)].join('\n')
      const parsed = readLeadingMeta(partRaw, issues, lineNumber + i)
      const part: MessagePart = { kind: start[1]!, text: transformText(cleanText(partRaw.slice(parsed.source.bodyStart)), true, false) }
      if (Object.keys(parsed.meta).length) part.data = parsed.meta
      if (typeof parsed.meta.id === 'string') part.id = parsed.meta.id
      append(part, i, end + 1, 'explicit')
      if (part.kind === 'answer') answers.push(part.text ?? '')
      if (part.kind === 'reasoning' && !thinking) thinking = { label: typeof part.data?.label === 'string' ? part.data.label : '思考过程', text: part.text ?? '' }
      if (part.kind === 'attachment' && (part.data?.kind === 'image' || part.data?.kind === 'file') && typeof part.data.name === 'string') attachments.push({ kind: part.data.kind, name: part.data.name, path: typeof part.data.path === 'string' ? part.data.path : null, meta: isRecord(part.data.meta) ? part.data.meta : {} })
      i = end; continue
    }
    if (COMMENT_START.test(line) && !line.includes('-->')) {
      comment = true; answer.push(line); legacyContent.push(line); continue
    }
    const tm = i === firstLine ? RE.THINK_RE.exec(line) : null
    if (tm) {
      flush()
      let end = i + 1
      while (end < lines.length && lines[end]!.startsWith('>')) end++
      thinking = { label: tm[1]!.trim(), text: cleanText(lines.slice(i + 1, end).map((l) => l === '>' ? '' : l.slice(1).replace(/^\s+/, '')).join('\n')) }
      append({ kind: 'reasoning', text: thinking.text, data: { label: thinking.label } }, i, end, 'reasoning')
      i = end - 1; continue
    }
    const linked = RE.ATTACH_LINK_RE.exec(line)
    const named = linked ? null : RE.ATTACH_NAME_RE.exec(line)
    const am = linked ?? named
    if (am) {
      flush()
      const attachmentStart = i
      const att: Attachment = { kind: am[1]!.startsWith('🖼') ? 'image' : 'file', name: am[2]!, path: linked ? linked[3] || null : null, meta: {} }
      if (lines[i + 1] && RE.META_RE.test(lines[i + 1]!)) {
        for (const m of lines[++i]!.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) att.meta[m[1]!] = m[3] ?? m[2]
      }
      attachments.push(att)
      append({ kind: 'attachment', data: { ...att } }, attachmentStart, i + 1, 'attachment')
      continue
    }
    const decoded = transformSentinel(line, false, false)
    answer.push(decoded)
    legacyContent.push(decoded)
  }
  flush()
  return { content: hasExplicitParts ? answers.join('\n\n') : cleanText(legacyContent.join('\n')), thinking, attachments, parts }
}

function attachSnapshots(object: Message | Session, source: SourceFragment) {
  source.headerSnapshot = json(headerData(object))
  source.metadataSnapshot = json(metadataData(object))
  if ('role' in object) source.bodySnapshot = json(bodyData(object))
  object._source = source
  source.snapshot = semantic(object)
}

export function parseChatlog(text: string): ChatDoc {
  const issues: LintIssue[] = []
  const { lines, heads, frontEnd } = structureOf(text, issues)
  const front = frontEnd ? text.slice(lines[0]!.end, lines.find((l) => l.end === frontEnd)!.start) : ''
  const frontMeta = readYaml(front, issues, 2)
  const format = typeof frontMeta.format === 'string' ? frontMeta.format : null
  if (format !== 'chatlog-md/2') {
    const legacy = parseChatlogV1(text)
    attachLegacySource(legacy, text)
    return legacy
  }
  delete frontMeta.format
  const doc: ChatDoc = { format, meta: frontMeta, sessions: [], issues }
  const firstStart = heads.length ? lines[heads[0]!.index]!.start : text.length
  doc._source = { raw: text.slice(0, firstStart), snapshot: '', headerEnd: frontEnd, yaml: front, metadataSnapshot: json({ format, meta: frontMeta }), eol: eolOf(text) }
  let session: Session | null = null
  const ids = new Map<string, number>()
  for (let n = 0; n < heads.length; n++) {
    const heading = heads[n]!
    const line = lines[heading.index]!
    const next = heads[n + 1]
    const end = next ? lines[next.index]!.start : text.length
    const raw = text.slice(line.start, end)
    const leading = readLeadingMeta(raw, issues, heading.index + 1)
    if (heading.kind === 'session') {
      const match = RE.SESSION_RE.exec(line.text)!
      session = { date: match[1]!, title: match[2]?.trim() ?? null, meta: leading.meta, messages: [], line: heading.index + 1, ...personal(leading.meta) }
      attachSnapshots(session, leading.source)
      doc.sessions.push(session)
      continue
    }
    if (!session) {
      session = { date: null, title: null, meta: {}, messages: [], line: heading.index + 1 }
      attachSnapshots(session, { raw: '', snapshot: '', eol: eolOf(text), headerEnd: 0, bodyStart: 0 })
      doc.sessions.push(session)
    }
    const match = RE.MSG_RE.exec(line.text)!
    let time: string | null = null
    let model: string | null = null
    for (const token of (match[2] ?? '').split('·').map((s) => s.trim()).filter(Boolean)) {
      const key = RE.TS_RE.test(token) ? 'time' : 'model'
      if ((key === 'time' ? time : model) !== null) issues.push({ level: 'error', rule: `duplicate-${key}`, line: heading.index + 1, message: `消息头存在重复${key === 'time' ? '时间' : '模型'}字段。` })
      else if (key === 'time') time = token
      else model = token
    }
    const meta = leading.meta
    const bodyLine = heading.index + 1 + (raw.slice(0, leading.source.bodyStart).match(/\n/g)?.length ?? 0)
    const message: Message = { role: match[1] as Message['role'], time, timePrecision: time ? time.length === 10 ? 'day' : time.length === 16 ? 'minute' : 'second' : null, model, meta, line: heading.index + 1, ...personal(meta), ...parseBody(raw.slice(leading.source.bodyStart), issues, bodyLine, leading.source) }
    const modelMeta = isRecord(meta.model) ? meta.model : {}
    const reasoning = isRecord(meta.reasoning) ? meta.reasoning : {}
    if (Object.keys(modelMeta).length || typeof reasoning.effort === 'string') message.modelInfo = {
      ...(typeof modelMeta.id === 'string' ? { id: modelMeta.id } : {}),
      ...(typeof modelMeta.name === 'string' ? { name: modelMeta.name } : {}),
      ...(typeof reasoning.effort === 'string' ? { reasoningEffort: reasoning.effort } : {}),
    }
    if (isRecord(meta.usage)) {
      message.usage = { ...meta.usage }
      for (const key of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens']) {
        const value = meta.usage[key]
        if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
          issues.push({ level: 'error', rule: 'invalid-token-count', line: message.line, message: `${key} 需要是非负整数。` })
          delete message.usage[key]
        }
      }
    }
    if (message.id) {
      if (ids.has(message.id)) issues.push({ level: 'warn', rule: 'duplicate-id', line: message.line, message: `消息 ID ${message.id} 与第 ${ids.get(message.id)} 行重复；记录已完整保留。` })
      else ids.set(message.id, message.line)
    }
    attachSnapshots(message, leading.source)
    session.messages.push(message)
  }
  return doc
}

function attachLegacySource(doc: ChatDoc, text: string) {
  const lines = linesOf(text)
  const first = doc.sessions[0]
  const prefixEnd = first ? lines[first.line - 1]?.start ?? text.length : text.length
  doc._source = { raw: text.slice(0, prefixEnd), snapshot: '', metadataSnapshot: json({ format: doc.format, meta: doc.meta }), eol: eolOf(text) }
  for (let si = 0; si < doc.sessions.length; si++) {
    const session = doc.sessions[si]!
    const sessionStart = lines[session.line - 1]!.start
    const firstMessage = session.messages[0]
    const nextSession = doc.sessions[si + 1]
    const sessionEnd = nextSession ? lines[nextSession.line - 1]!.start : text.length
    const prefix = text.slice(sessionStart, firstMessage ? lines[firstMessage.line - 1]!.start : sessionEnd)
    attachSnapshots(session, readLeadingMeta(prefix, [], session.line).source)
    for (let mi = 0; mi < session.messages.length; mi++) {
      const message = session.messages[mi]!
      const nextMessage = session.messages[mi + 1]
      const end = nextMessage ? lines[nextMessage.line - 1]!.start : sessionEnd
      const raw = text.slice(lines[message.line - 1]!.start, end)
      attachSnapshots(message, readLeadingMeta(raw, [], message.line).source)
    }
  }
}

function metadataFor(object: Message | Session): Metadata {
  const meta: Metadata = { ...object.meta }
  const previous = object._source?.metadataSnapshot ? JSON.parse(object._source.metadataSnapshot) as { normalized: Metadata } : undefined
  const normalized = normalizedMetadata(object)
  for (const key of personalKeys) {
    if (!previous || json(normalized[key]) !== json(previous.normalized[key])) {
      if (normalized[key] === undefined) delete meta[key]
      else meta[key] = normalized[key]
    }
  }
  if ('role' in object) {
    if (!previous || json(object.usage) !== json(previous.normalized.usage)) {
      if (object.usage === undefined) delete meta.usage
      else meta.usage = object.usage
    }
    if (!previous || json(object.modelInfo) !== json(previous.normalized.modelInfo)) {
      const model = { ...(isRecord(meta.model) ? meta.model : {}) }
      const reasoning = { ...(isRecord(meta.reasoning) ? meta.reasoning : {}) }
      delete model.id; delete model.name; delete reasoning.effort
      if (object.modelInfo?.id) model.id = object.modelInfo.id
      if (object.modelInfo?.name) model.name = object.modelInfo.name
      if (object.modelInfo?.reasoningEffort) reasoning.effort = object.modelInfo.reasoningEffort
      if (Object.keys(model).length) meta.model = model; else delete meta.model
      if (Object.keys(reasoning).length) meta.reasoning = reasoning; else delete meta.reasoning
    }
  }
  return meta
}

function yamlFor(meta: Metadata, source?: SourceFragment): string {
  if (source?.yaml) {
    const yaml = parseDocument(source.yaml)
    if (!yaml.errors.length && isRecord(yaml.toJS())) {
      const before = yaml.toJS() as Metadata
      for (const key of Object.keys(before)) if (!(key in meta)) yaml.delete(key)
      for (const [key, value] of Object.entries(meta)) if (json(before[key]) !== json(value)) yaml.set(key, value)
      return yaml.toString({ lineWidth: 0 })
    }
  }
  return stringify(meta, { lineWidth: 0 })
}

function metadataBlock(meta: Metadata, eol: string, source?: SourceFragment): string {
  if (!Object.keys(meta).length) return ''
  let yaml = yamlFor(meta, source)
  // HTML 注释不能嵌套结束标记；双引号 YAML 转义保证文本语义不变。
  if (yaml.includes('-->')) yaml = stringify(meta, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'QUOTE_DOUBLE' }).replace(/-->/g, '--\\u003e')
  return `<!-- @meta${eol}${yaml.replace(/\n/g, eol)}-->${eol}`
}

function headerFor(object: Message | Session): string {
  if ('role' in object) {
    const icon = object.role === 'user' ? '🧑‍💻' : object.role === 'ai' ? '🤖' : '⚙️'
    return `## ${icon} @${object.role}${object.time ? ` · ${object.time}` : ''}${object.model ? ` · ${object.model}` : ''}`
  }
  return object.date ? `# @${object.date}${object.title ? ` · ${object.title}` : ''}` : ''
}

/** 普通正文中的结构标记仅在围栏外转义，代码示例保持原样。 */
function escapeBody(text: string): string {
  return transformText(text, false, true)
}

function partText(part: MessagePart, raw?: string): string {
  const meta = { ...part.data, ...(part.id ? { id: part.id } : {}) }
  const text = part.text === undefined ? undefined : transformText(part.text, true, true)
  const source = raw ? readLeadingMeta(raw, [], 0).source : undefined
  return `<!-- @part ${part.kind} -->\n${metadataBlock(meta, '\n', source)}${text ? `${text}\n` : ''}<!-- @endpart -->`
}

function bodyFor(message: Message): string {
  const old = message._source?.bodySnapshot ? JSON.parse(message._source.bodySnapshot) as Pick<Message, 'content' | 'thinking' | 'attachments' | 'parts'> : undefined
  const partsChanged = message.parts !== undefined && (!old || json(message.parts) !== json(old.parts))
  let parts = [...(message.parts ?? [])]
  if (!partsChanged) {
    let wroteAnswer = false
    let wroteThinking = false
    parts = parts.flatMap((part) => {
      if (part.kind === 'answer' && old && message.content !== old.content) {
        if (wroteAnswer) return []
        wroteAnswer = true
        return [{ ...part, text: message.content }]
      }
      if (part.kind === 'reasoning' && old && json(message.thinking) !== json(old.thinking)) {
        if (wroteThinking || !message.thinking) return []
        wroteThinking = true
        return [{ ...part, text: message.thinking.text, data: { ...part.data, label: message.thinking.label } }]
      }
      return [part]
    })
    if (!parts.some((part) => part.kind === 'answer') && message.content) parts.push({ kind: 'answer', text: message.content })
    if (!parts.some((part) => part.kind === 'reasoning') && message.thinking) parts.unshift({ kind: 'reasoning', text: message.thinking.text, data: { label: message.thinking.label } })
  }
  const attachmentsChanged = old ? json(message.attachments) !== json(old.attachments) : message.attachments.length > 0
  if (attachmentsChanged || (!parts.some((part) => part.kind === 'attachment') && message.attachments.length && !partsChanged)) {
    parts = syncAttachmentParts(parts, message.attachments)
  }
  return serializeBodyParts(parts, old?.parts ?? [], message._source, partText, escapeBody)
}

function objectText(object: Message | Session, defaultEol: string): string {
  const source = object._source
  const eol = source?.eol ?? defaultEol
  const header = headerFor(object)
  if (!source) {
    const prefix = `${header ? header + eol : ''}${metadataBlock(metadataFor(object), eol)}`
    return 'role' in object ? `${prefix}${bodyFor(object).replace(/\n/g, eol)}` : `${prefix}${prefix ? eol : ''}`
  }
  const headerSame = source.headerSnapshot === json(headerData(object))
  const metaSame = source.metadataSnapshot === json(metadataData(object))
  const bodySame = !('role' in object) || source.bodySnapshot === json(bodyData(object))
  if (headerSame && metaSame && bodySame) return source.raw
  const headerText = headerSame ? source.raw.slice(0, source.headerEnd) : header ? `${header}${eol}` : ''
  let rest = source.raw.slice(source.headerEnd)
  if (!metaSame) {
    const meta = metadataBlock(metadataFor(object), eol, source)
    rest = source.metaStart !== undefined
      ? source.raw.slice(source.headerEnd, source.metaStart) + meta + source.raw.slice(source.metaEnd)
      : meta + rest
  }
  if ('role' in object && !bodySame) {
    const prefix = source.metaStart !== undefined
      ? source.raw.slice(source.headerEnd, source.metaStart) + (metaSame ? source.raw.slice(source.metaStart, source.metaEnd) : metadataBlock(metadataFor(object), eol, source))
      : metaSame ? '' : metadataBlock(metadataFor(object), eol, source)
    rest = `${prefix}${bodyFor(object).replace(/\n/g, eol)}`
  }
  return headerText + rest
}

export function serializeChatlog(doc: ChatDoc): string {
  const eol = doc._source?.eol ?? '\n'
  let prefix: string
  if (doc._source?.metadataSnapshot === json({ format: doc.format, meta: doc.meta })) prefix = doc._source.raw
  else {
    const front = { format: doc.format ?? 'chatlog-md/2', ...doc.meta }
    const originalPrefix = doc._source?.raw ?? ''
    const structure = structureOf(originalPrefix)
    const suffix = structure.frontEnd ? originalPrefix.slice(structure.frontEnd) : originalPrefix.replace(/^\uFEFF/, '')
    prefix = `${originalPrefix.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}${yamlFor(front, doc._source).replace(/\n/g, eol)}---${eol}${suffix || eol}`
  }
  const chunks = [prefix]
  for (const session of doc.sessions) {
    const last = chunks[chunks.length - 1] ?? ''
    if (last && !last.endsWith('\n') && headerFor(session)) chunks.push(eol + eol)
    chunks.push(objectText(session, eol))
    for (const message of session.messages) {
      const previous = chunks[chunks.length - 1] ?? ''
      if (previous && !previous.endsWith('\n')) chunks.push(eol + eol)
      chunks.push(objectText(message, eol))
    }
  }
  return chunks.join('')
}

export interface MigrationReport {
  ok: boolean
  sessions: number
  messages: number
  thinking: number
  attachments: number
  removedWeekdayTitles: number
  rawFragmentsVerified: number
  failures: string[]
}

/** 迁移只改版本声明和纯星期日期标题，其余字节片段逐一原样保留。 */
function migrationText(text: string): string {
  const original = parseChatlog(text)
  if (original.format !== 'chatlog-md/1') throw new Error('迁移输入必须是 chatlog-md/1。')
  const lines = linesOf(text)
  const changes: { start: number; end: number; replacement: string }[] = []
  const formatLine = lines.find((l) => /^format:\s*chatlog-md\/1\s*$/.test(l.text))
  if (!formatLine) throw new Error('未找到明确的 v1 format 声明。')
  changes.push({ start: formatLine.start, end: formatLine.end, replacement: text.slice(formatLine.start, formatLine.end).replace('chatlog-md/1', 'chatlog-md/2') })
  for (const session of original.sessions) {
    if (session.title && weekday.test(session.title)) {
      const line = lines[session.line - 1]!
      const eol = text.slice(line.start, line.end).match(/\r?\n$/)?.[0] ?? ''
      changes.push({ start: line.start, end: line.end, replacement: `# @${session.date}${eol}` })
    }
  }
  let candidate = text
  for (const change of changes.sort((a, b) => b.start - a.start)) candidate = candidate.slice(0, change.start) + change.replacement + candidate.slice(change.end)
  return candidate
}

export function migrateV1ToV2(text: string): { text: string; report: MigrationReport } {
  const candidate = migrationText(text)
  return { text: candidate, report: verifyMigration(text, candidate) }
}

function migrationContentMatches(before: Message, after: Message): boolean {
  if (before.content === after.content) return true
  if (before._source!.raw !== after._source!.raw) return false
  // v1 会剥去普通 Markdown 标题等行首的反斜杠，v2 只解码真正的结构标记。
  // 仅在原始消息完全相同时兼容这种旧投影；不改变原文，也不放宽结构转义校验。
  const legacyContent = after.content.split('\n').map((line) =>
    transformSentinel(line, false, false) === line
      ? line.replace(RE.ESCAPED_RE, (match) => match.slice(1))
      : line,
  ).join('\n')
  return before.content === legacyContent
}

export function verifyMigration(source: string, candidate: string): MigrationReport {
  const before = parseChatlog(source)
  const after = parseChatlog(candidate)
  const messages = before.sessions.flatMap((s) => s.messages)
  const report: MigrationReport = { ok: false, sessions: before.sessions.length, messages: messages.length, thinking: messages.filter((m) => m.thinking).length, attachments: messages.reduce((sum, m) => sum + m.attachments.length, 0), removedWeekdayTitles: before.sessions.filter((s) => s.title && weekday.test(s.title)).length, rawFragmentsVerified: 0, failures: [] }
  if (migrationText(source) !== candidate) report.failures.push('存在版本声明、纯星期标题以外的原始字节片段变化')
  if (after.format !== 'chatlog-md/2') report.failures.push('输出格式不是 v2')
  if (before.sessions.length !== after.sessions.length) report.failures.push('日期节数量变化')
  before.sessions.forEach((session, si) => {
    const target = after.sessions[si]
    if (!target) return
    const expectedTitle = session.title && weekday.test(session.title) ? null : session.title
    if (session.date !== target.date || expectedTitle !== target.title || json(session.meta) !== json(target.meta)) report.failures.push(`日期节 ${si + 1} 语义变化`)
    if (session.messages.length !== target.messages.length) report.failures.push(`日期节 ${si + 1} 消息数量变化`)
    session.messages.forEach((message, mi) => {
      const migrated = target.messages[mi]
      if (!migrated) return
      const fields = ['role', 'time', 'timePrecision', 'model', 'meta', 'thinking', 'attachments'] as const
      for (const key of fields) if (json(message[key]) !== json(migrated[key])) report.failures.push(`日期节 ${si + 1} 消息 ${mi + 1} 字段 ${key} 变化`)
      if (!migrationContentMatches(message, migrated)) report.failures.push(`日期节 ${si + 1} 消息 ${mi + 1} 字段 content 变化`)
      if (message._source?.raw === migrated._source?.raw) report.rawFragmentsVerified++
      else report.failures.push(`日期节 ${si + 1} 消息 ${mi + 1} 原始片段变化`)
    })
  })
  if (json(before.meta) !== json(after.meta)) report.failures.push('文档元数据变化')
  if (serializeChatlog(after) !== candidate) report.failures.push('v2 无操作读写不一致')
  for (const issue of after.issues.filter((item) => item.level === 'error')) report.failures.push(`输出结构错误：${issue.rule} 行 ${issue.line}`)
  report.ok = report.failures.length === 0
  return report
}
