/**
 * 校验用 CLI：输出与 Python 参考解析器 chatlog_parse.py 完全相同格式的统计行，便于直接 diff。
 * 用法：npm run parse:check -- <文件.chat.md> [-o out.json]
 */
import fs from 'node:fs'
import { parseChatlog } from './chatlog'
import { lintChatDoc } from './lint'

const args = process.argv.slice(2)
const oIdx = args.findIndex((a) => a === '-o' || a === '--out')
const out = oIdx >= 0 ? args[oIdx + 1] : undefined
const file = args.filter((_, i) => oIdx < 0 || (i !== oIdx && i !== oIdx + 1))[0]
if (!file) {
  console.error('用法: npm run parse:check -- <文件.chat.md> [-o out.json]')
  process.exit(1)
}

const doc = parseChatlog(fs.readFileSync(file, 'utf8'))
const msgs = doc.sessions.flatMap((s) => s.messages)

// 模拟 Python dict 的插入序 + repr 格式：{'user': 162, 'ai': 171} / {'day': 2, None: 50, ...}
function pyDict(counts: Map<string | null, number>): string {
  const entries = [...counts.entries()].map(([k, v]) => `${k === null ? 'None' : `'${k}'`}: ${v}`)
  return `{${entries.join(', ')}}`
}
const count = <K>(keys: K[]): Map<K, number> => {
  const m = new Map<K, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  return m
}

console.log(`sessions=${doc.sessions.length} messages=${msgs.length} roles=${pyDict(count(msgs.map((m) => m.role)))}`)
console.log(`time_precision=${pyDict(count(msgs.map((m) => m.timePrecision)))}`)
console.log(
  `model=${msgs.filter((m) => m.model).length} thinking=${msgs.filter((m) => m.thinking).length} ` +
    `attachments=${msgs.reduce((n, m) => n + m.attachments.length, 0)}`,
)

const issues = [...doc.issues, ...lintChatDoc(doc)]
if (issues.length) {
  console.log(`\nlint: ${issues.length} 条`)
  for (const it of issues) console.log(`  [${it.level}] 行${it.line} ${it.rule}: ${it.message}`)
}

if (out) {
  fs.writeFileSync(out, JSON.stringify(doc, null, 1), 'utf8')
  console.log(`JSON -> ${out}`)
}
