import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ entries: vi.fn(), get: vi.fn(), setMany: vi.fn() }))
vi.mock('idb-keyval', () => db)
import { listWorkspaces, persistWorkspace, restoreWorkspace, type WorkspaceSnapshot } from './workspace'

const snapshot = (key: string): WorkspaceSnapshot => ({ key, name: '虚构.chat.md', text: '正文', baseline: '原文', sourceKind: 'files', assets: [], pendingAssets: ['assets/new.png'], revisions: [{ id: 'rev', at: 1, label: '初始', text: '原文' }], updatedAt: 1 })

beforeEach(() => { db.get.mockReset(); db.setMany.mockReset().mockResolvedValue(undefined) })

describe('工作区持久化', () => {
  it('文档、未写附件和最近打开指针在同一原子提交中保存', async () => {
    const state = snapshot('one')
    await persistWorkspace(state)
    expect(db.setMany).toHaveBeenCalledExactlyOnceWith([
      ['dialogary:v2:document:one', state], ['dialogary:v2:workspace', 'one'],
    ])
  })

  it('提交时克隆快照；旧写入再慢也不能晚于新草稿落盘', async () => {
    let finish: (() => void) | undefined
    db.setMany.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const first = snapshot('one')
    const oldWrite = persistWorkspace(first)
    first.revisions[0]!.text = '不应混入'
    first.pendingAssets!.push('later.png')
    const newWrite = persistWorkspace(snapshot('two'))
    await vi.waitFor(() => expect(db.setMany).toHaveBeenCalledTimes(1))
    expect(db.setMany.mock.calls[0]![0][0][1].revisions[0].text).toBe('原文')
    expect(db.setMany.mock.calls[0]![0][0][1].pendingAssets).toEqual(['assets/new.png'])
    finish!()
    await Promise.all([oldWrite, newWrite])
    expect(db.setMany).toHaveBeenCalledTimes(2)
    expect(db.setMany.mock.calls[1]![0][1][1]).toBe('two')
  })

  it('一次配额错误不会阻塞后续保存，调用方仍能收到错误', async () => {
    db.setMany.mockRejectedValueOnce(new Error('quota'))
    await expect(persistWorkspace(snapshot('failed'))).rejects.toThrow('quota')
    await expect(persistWorkspace(snapshot('recovered'))).resolves.toBeUndefined()
  })

  it('恢复包含未写入附件的原始草稿', async () => {
    const state = snapshot('one')
    db.get.mockResolvedValueOnce('one').mockResolvedValueOnce(state)
    expect(await restoreWorkspace()).toEqual(state)
  })

  it('最近文件只读取文档快照，并按实际保存时间倒序', async () => {
    const older = { ...snapshot('old'), updatedAt: 10 }
    const newer = { ...snapshot('new'), updatedAt: 20 }
    db.entries.mockResolvedValue([['dialogary:v2:document:old', older], ['dialogary:v2:workspace', 'new'], ['unrelated', {}], ['dialogary:v2:document:new', newer]])
    expect(await listWorkspaces()).toEqual([newer, older])
  })
})
