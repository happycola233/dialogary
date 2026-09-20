import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const temporaryRoot = path.resolve('.tmp')
let fixtureRoot: string
let sourcePath: string
let candidatePath: string
let assetRoot: string
const original = '---\nformat: chatlog-md/1\n---\n# @2026-09-19 · 周六\n\n## 🧑‍💻 @user\n\n📄 [字面文件](assets/exact%20name.txt)\n📄 [编码文件](assets/encoded%20name.txt)\n📄 [百分号文件](assets/100%.txt)\n\n完全虚构的正文。\n\\# 普通标题\n'

beforeAll(() => {
  fs.mkdirSync(temporaryRoot, { recursive: true })
  fixtureRoot = fs.mkdtempSync(path.join(temporaryRoot, 'migration-cli-'))
  fs.mkdirSync(path.join(fixtureRoot, 'backups'))
  assetRoot = path.join(fixtureRoot, 'journal')
  fs.mkdirSync(path.join(assetRoot, 'assets'), { recursive: true })
  sourcePath = path.join(fixtureRoot, 'backups', 'original.chat.md')
  candidatePath = path.join(assetRoot, 'candidate.chat.md')
  fs.writeFileSync(sourcePath, original)
  fs.writeFileSync(candidatePath, original.replace('chatlog-md/1', 'chatlog-md/2').replace(' · 周六', ''))
  fs.writeFileSync(path.join(assetRoot, 'assets', 'exact%20name.txt'), 'literal percent-encoded looking name')
  fs.writeFileSync(path.join(assetRoot, 'assets', 'encoded name.txt'), 'decoded filename')
  fs.writeFileSync(path.join(assetRoot, 'assets', '100%.txt'), 'literal percent')
})

afterAll(() => {
  // 递归清理前确认目标仍是本测试在 .tmp 中创建的直接子目录。
  if (path.dirname(path.resolve(fixtureRoot)) !== temporaryRoot || !path.basename(fixtureRoot).startsWith('migration-cli-')) throw new Error('测试清理路径越界')
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
})

function verify(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/chatlog-migrate.ts', sourcePath, '--verify', candidatePath, ...args], { cwd: process.cwd(), encoding: 'utf8' })
}

describe('异地 v1 备份附件核验', () => {
  it('默认按备份所在目录检查，不把缺失附件判定为成功', () => {
    const result = verify([])
    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout)
    expect(report.ok).toBe(false)
    expect(report.rawFragmentsVerified).toBe(1)
    expect(report.attachments).toEqual({ references: 3, verified: 0 })
  })

  it('指定原附件目录，精确与编码路径均正确，不写备份或已安装文件', () => {
    const sourceBytes = fs.readFileSync(sourcePath)
    const candidateBytes = fs.readFileSync(candidatePath)
    const result = verify(['--asset-root', assetRoot])
    expect(result.status, result.stderr).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.ok).toBe(true)
    expect(report.attachments).toEqual({ references: 3, verified: 3 })
    expect(fs.readFileSync(sourcePath).equals(sourceBytes)).toBe(true)
    expect(fs.readFileSync(candidatePath).equals(candidateBytes)).toBe(true)
  })

  it('路径参数缺值时明确报错', () => {
    const result = verify(['--asset-root'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--asset-root 后需要提供路径')
  })
})
