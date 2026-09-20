/** 私有数据只在显式输入与输出之间转换，不将正文写入日志。 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { migrateV1ToV2, parseChatlog, verifyMigration } from '../src/parser/chatlog'

const args = process.argv.slice(2)
const valueFlags = ['--out', '--report', '--verify', '--asset-root']
const valueAfter = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const sourceArg = args.find((arg, index) => !arg.startsWith('--') && (index === 0 || !valueFlags.includes(args[index - 1]!)))
if (!sourceArg || args.includes('--help')) {
  console.log('用法: npx tsx scripts/chatlog-migrate.ts <v1.chat.md> [--dry-run] [--out <v2.chat.md>] [--report <report.json>] [--verify <v2.chat.md>] [--asset-root <附件基准目录>]')
  process.exit(sourceArg ? 0 : 1)
}
for (const flag of valueFlags) if (args.includes(flag) && (!valueAfter(flag) || valueAfter(flag)!.startsWith('--'))) throw new Error(`${flag} 后需要提供路径。`)

const sourcePath = path.resolve(sourceArg)
const sourceBytes = fs.readFileSync(sourcePath)
const sourceText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes)
const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex')
const sourceHash = sha256(sourceBytes)
const assetRoot = path.resolve(valueAfter('--asset-root') ?? path.dirname(sourcePath))
const candidatePath = valueAfter('--verify')
const migration = candidatePath
  ? { text: fs.readFileSync(path.resolve(candidatePath), 'utf8'), report: verifyMigration(sourceText, fs.readFileSync(path.resolve(candidatePath), 'utf8')) }
  : migrateV1ToV2(sourceText)

// 附件按本地路径去重核验；只读检查不会复制、重命名或修改原附件。
const references = new Set(parseChatlog(sourceText).sessions.flatMap((session) => session.messages.flatMap((message) => message.attachments.map((attachment) => attachment.path))).filter((reference): reference is string => !!reference && !/^[a-z][a-z\d+.-]*:/i.test(reference) && !reference.startsWith('//')))
const attachments = [...references].map((reference) => {
  const candidates = [path.resolve(assetRoot, reference)]
  // 先匹配真实字面文件名，再尝试 URL 编码。文件名中的裸百分号不能使校验崩溃。
  try { candidates.push(path.resolve(assetRoot, decodeURIComponent(reference.split(/[?#]/)[0]!))) } catch { /* 非 URI 的字面路径仍由精确匹配处理。 */ }
  const attachmentPath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  return { reference, exists: attachmentPath !== undefined, sha256: attachmentPath ? sha256(fs.readFileSync(attachmentPath)) : null }
})
const report = {
  ...migration.report,
  sourceSha256: sourceHash,
  candidateSha256: sha256(migration.text),
  sourceBytes: sourceBytes.length,
  candidateBytes: Buffer.byteLength(migration.text, 'utf8'),
  encoding: 'utf-8',
  bom: sourceBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
  newline: sourceText.includes('\r\n') ? 'CRLF' : 'LF',
  attachments,
}
if (attachments.some((attachment) => !attachment.exists)) {
  report.ok = false
  report.failures.push(`${attachments.filter((attachment) => !attachment.exists).length} 个本地附件不存在`)
}
console.log(JSON.stringify({ ...report, attachments: { references: references.size, verified: attachments.filter((attachment) => attachment.exists).length } }, null, 2))
if (!report.ok) process.exit(1)
if (args.includes('--dry-run') || candidatePath) process.exit(0)

const migrationDir = path.resolve('.tmp', 'migration', sourceHash.slice(0, 16))
fs.mkdirSync(migrationDir, { recursive: true })
const outPath = path.resolve(valueAfter('--out') ?? path.join(migrationDir, path.basename(sourcePath).replace(/\.chat\.md$/i, '.v2.chat.md')))
const reportPath = path.resolve(valueAfter('--report') ?? path.join(migrationDir, 'migration-report.json'))
const backupPath = path.join(migrationDir, path.basename(sourcePath).replace(/\.chat\.md$/i, '.v1.chat.md'))
if ([outPath, reportPath, backupPath].includes(sourcePath)) throw new Error('输出与报告不能覆盖输入原件。')
if (new Set([outPath, reportPath, backupPath]).size !== 3) throw new Error('输出、报告与备份必须使用不同路径。')
if (fs.existsSync(outPath) || fs.existsSync(reportPath)) throw new Error('输出或报告已存在；请选择新路径，已有结果不会被覆盖。')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
if (fs.existsSync(backupPath)) {
  if (sha256(fs.readFileSync(backupPath)) !== sourceHash) throw new Error('现有备份哈希不匹配。')
} else fs.writeFileSync(backupPath, sourceBytes, { flag: 'wx' })
fs.writeFileSync(outPath, migration.text, { encoding: 'utf8', flag: 'wx' })
fs.writeFileSync(reportPath, JSON.stringify({ ...report, backupPath, candidatePath: outPath }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
if (sha256(fs.readFileSync(sourcePath)) !== sourceHash) throw new Error('迁移期间源文件被其他程序修改，请使用最新原件重新运行。')
console.log(`v1 备份: ${backupPath}\nv2 候选: ${outPath}\n核验报告: ${reportPath}\n原文件未修改。`)
