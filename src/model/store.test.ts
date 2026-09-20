import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseChatlog, serializeChatlog } from '../parser/chatlog'
import { applyBatchEdit } from './mutations'
import { createMessageDraft } from '../editor/types'
import { useAppStore } from './store'
import * as fileAccess from '../data/fileAccess'
import * as workspace from '../data/workspace'

vi.mock('../data/fileAccess', () => ({
  chooseFile: vi.fn(),
  chooseSaveFile: vi.fn(),
  downloadText: vi.fn(),
  writeFile: vi.fn(),
  writeAsset: vi.fn(),
}))
vi.mock('../data/workspace', () => ({
  persistWorkspace: vi.fn().mockResolvedValue(undefined),
  restoreWorkspace: vi.fn(),
  workspaceFor: vi.fn(),
  createRevision: (text: string, label: string) => ({
    id: crypto.randomUUID(),
    at: Date.now(),
    label,
    text,
  }),
}))

const SOURCE =
  '---\nformat: chatlog-md/2\ntitle: 虚构测试\n---\n\n# @2026-09-19\n\n## 🧑‍💻 @user\n\n第一段\n\n## 🤖 @ai\n\n第二段\n'

function handleWith(text: string) {
  return {
    name: 'test.chat.md',
    getFile: vi.fn(async () => new File([text], 'test.chat.md')),
    isSameEntry: vi.fn(async () => true),
  } as unknown as FileSystemFileHandle
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(workspace.persistWorkspace).mockResolvedValue(undefined)
  vi.mocked(fileAccess.chooseSaveFile).mockResolvedValue(undefined)
  useAppStore.getState().loadText('test.chat.md', SOURCE)
})

describe('本地保存与草稿边界', () => {
  it('外部文件变化时阻止写入，保留完整草稿并进入冲突对照', async () => {
    const handle = handleWith(SOURCE + '\n外部修改')
    useAppStore.setState({ fileHandle: handle })
    useAppStore.getState().commitText(SOURCE.replace('第一段', '本地修改'), '测试')
    await useAppStore.getState().saveFile()
    expect(fileAccess.writeFile).not.toHaveBeenCalled()
    expect(useAppStore.getState()).toMatchObject({
      fileStatus: 'conflict',
      externalText: SOURCE + '\n外部修改',
    })
    expect(useAppStore.getState().text).toContain('本地修改')
  })

  it('写入后重新读取并核验，成功才更新磁盘基线', async () => {
    const handle = handleWith(SOURCE)
    useAppStore.setState({ fileHandle: handle })
    const edited = SOURCE.replace('第一段', '保存成功')
    useAppStore.getState().commitText(edited, '测试')
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(async () => {
      vi.mocked(handle.getFile).mockResolvedValue(new File([edited], handle.name))
    })
    await useAppStore.getState().saveFile()
    expect(fileAccess.writeFile).toHaveBeenCalledWith(handle, edited)
    expect(useAppStore.getState()).toMatchObject({ baseline: edited, fileStatus: 'saved' })
  })

  it('保存后校验失败时基线不动，仍能恢复当前内容', async () => {
    useAppStore.setState({ fileHandle: handleWith(SOURCE) })
    const edited = SOURCE.replace('第一段', '待恢复的修改')
    useAppStore.getState().commitText(edited, '测试')
    await useAppStore.getState().saveFile()
    expect(useAppStore.getState()).toMatchObject({
      baseline: SOURCE,
      text: edited,
      fileStatus: 'error',
    })
  })

  it('网页副本保存为本地文件后切换持久化来源，刷新不会取回旧网页正文', async () => {
    useAppStore.setState({ sourceKind: 'server', sourceKey: 'server:test.chat.md' })
    const handle = handleWith(SOURCE)
    const edited = SOURCE.replace('第一段', '保留本地保存的内容')
    vi.mocked(fileAccess.chooseSaveFile).mockResolvedValue(handle)
    useAppStore.getState().commitText(edited, '编辑网页副本')
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(async () => {
      vi.mocked(handle.getFile).mockResolvedValue(new File([edited], handle.name))
    })
    await useAppStore.getState().saveFile()
    expect(workspace.persistWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceKind: 'files',
        fileHandle: handle,
        text: edited,
        baseline: edited,
      }),
    )
  })

  it('下载副本不会谎称已经写回原文件', async () => {
    const edited = SOURCE.replace('第一段', '浏览器下载')
    useAppStore.getState().commitText(edited, '测试')
    await useAppStore.getState().saveFile()
    expect(fileAccess.downloadText).toHaveBeenCalledWith('test.chat.md', edited)
    expect(useAppStore.getState()).toMatchObject({ baseline: SOURCE, fileStatus: 'downloaded' })
  })

  it('取消另存为不会写入或改变基线', async () => {
    vi.mocked(fileAccess.chooseSaveFile).mockResolvedValue(null)
    await useAppStore.getState().saveFile(true)
    expect(fileAccess.writeFile).not.toHaveBeenCalled()
    expect(useAppStore.getState().baseline).toBe(SOURCE)
  })

  it('有本地附件的另存必须先提供完整归档', async () => {
    useAppStore.getState().loadText('test.chat.md', SOURCE + '\n📄 [资料.txt](assets/test.txt)\n')
    await useAppStore.getState().saveFile(true)
    expect(useAppStore.getState().panel).toBe('archive')
    expect(fileAccess.chooseSaveFile).not.toHaveBeenCalled()
  })

  it('草稿失败会阻止切换到新日记，避免丢失未落盘内容', async () => {
    vi.mocked(workspace.persistWorkspace).mockRejectedValue(new Error('quota'))
    await useAppStore.getState().newDocument()
    expect(useAppStore.getState()).toMatchObject({ text: SOURCE, draftStatus: 'error' })
  })

  it('新增附件等待写入的信息随草稿一起持久化', async () => {
    useAppStore.setState({ pendingAssets: new Set(['assets/new.png']) })
    await useAppStore.getState().saveDraft()
    expect(workspace.persistWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ pendingAssets: ['assets/new.png'] }),
    )
  })

  it('写入期间阻止切换，新发生的编辑仍保留为待写草稿', async () => {
    const handle = handleWith(SOURCE)
    useAppStore.setState({ fileHandle: handle })
    let finishWrite!: () => void
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )
    const saving = useAppStore.getState().saveFile()
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    await useAppStore.getState().newDocument()
    expect(useAppStore.getState().sourceName).toBe('test.chat.md')
    useAppStore.getState().commitText(SOURCE.replace('第一段', '保存期间继续写'), '继续编辑')
    finishWrite()
    await saving
    expect(useAppStore.getState()).toMatchObject({ baseline: SOURCE, fileStatus: 'idle' })
    expect(useAppStore.getState().text).toContain('保存期间继续写')
  })

  it('写入期间撤销也保持保存锁，不能启动第二次写入或切换文件', async () => {
    const handle = handleWith(SOURCE)
    useAppStore.setState({ fileHandle: handle })
    const edited = SOURCE.replace('第一段', '准备保存')
    useAppStore.getState().commitText(edited, '编辑')
    let finishWrite!: () => void
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )
    const saving = useAppStore.getState().saveFile()
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    useAppStore.getState().undo()
    expect(useAppStore.getState().fileStatus).toBe('saving')
    await useAppStore.getState().saveFile()
    expect(fileAccess.writeFile).toHaveBeenCalledTimes(1)
    await useAppStore.getState().newDocument()
    expect(useAppStore.getState().sourceName).toBe('test.chat.md')
    vi.mocked(handle.getFile).mockResolvedValue(new File([edited], handle.name))
    finishWrite()
    await saving
    expect(useAppStore.getState()).toMatchObject({
      text: SOURCE,
      baseline: edited,
      fileStatus: 'idle',
    })
    useAppStore.getState().redo()
    expect(useAppStore.getState()).toMatchObject({ text: edited, baseline: edited })
  })

  it('旧文档保存完成不能把句柄、基线或状态写入新文档', async () => {
    const handle = handleWith(SOURCE)
    useAppStore.setState({ fileHandle: handle })
    let finishWrite!: () => void
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )
    const saving = useAppStore.getState().saveFile()
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    useAppStore.getState().loadText('different.chat.md', SOURCE.replace('第一段', '另一份原文'))
    const newState = useAppStore.getState()
    finishWrite()
    await saving
    expect(useAppStore.getState()).toMatchObject({
      sourceKey: newState.sourceKey,
      sourceName: newState.sourceName,
      text: newState.text,
      baseline: newState.baseline,
      fileHandle: undefined,
      fileStatus: 'idle',
    })
  })

  it('晚到的旧草稿失败不覆盖新文档的保存状态', async () => {
    let rejectOld!: (reason: unknown) => void
    vi.mocked(workspace.persistWorkspace).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOld = reject
        }),
    )
    const saving = useAppStore.getState().saveDraft()
    useAppStore.getState().loadText('different.chat.md', SOURCE)
    await useAppStore.getState().saveDraft()
    rejectOld(new Error('quota'))
    expect(await saving).toBe(false)
    expect(useAppStore.getState().draftStatus).toBe('saved')
  })
})

describe('批量操作的完整性', () => {
  it('修改日期后同步消息日期，不把派生 ID 或旧时间写回', () => {
    useAppStore
      .getState()
      .loadText('test.chat.md', SOURCE.replace('@user\n', '@user · 2026-09-19 08:30\n'))
    const derived = useAppStore.getState().doc!.sessions[0]!
    useAppStore.getState().patchSession(0, { ...derived, date: '2026-09-21' })
    const raw = useAppStore.getState().rawDoc!.sessions[0]!
    expect(raw.messages[0]!.time).toBe('2026-09-21 08:30')
    expect(raw.messages[0]!.id).toBeUndefined()
    expect(raw.messages[1]!.id).toBeUndefined()
  })
  it('无 ID 的多条记录同时修改并移动，保持正文顺序并可一次撤销', () => {
    useAppStore.getState().mutate('批量整理', (doc) =>
      applyBatchEdit(doc, [0, 1], {
        addTags: ['测试'],
        removeTags: [],
        date: '2026-09-20',
        starred: true,
      }),
    )
    const messages = useAppStore.getState().doc!.messages
    expect(messages.map((message) => message.content)).toEqual(['第一段', '第二段'])
    expect(
      messages.every(
        (message) =>
          message.effectiveDate === '2026-09-20' &&
          message.starred &&
          message.tags?.includes('测试'),
      ),
    ).toBe(true)
    expect(new Set(messages.map((message) => message.id)).size).toBe(2)
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(SOURCE)
    useAppStore.getState().redo()
    expect(useAppStore.getState().doc!.messages[0]!.effectiveDate).toBe('2026-09-20')
  })

  it('重复 ID 仍按文档位置修改，未选消息保持不变', () => {
    const source = SOURCE.replaceAll(
      '@user\n',
      '@user\n<!-- @meta\nid: duplicated\n-->\n',
    ).replaceAll('@ai\n', '@ai\n<!-- @meta\nid: duplicated\n-->\n')
    const doc = parseChatlog(source)
    applyBatchEdit(doc, [1], { addTags: ['只修改第二条'], removeTags: [] })
    const written = parseChatlog(serializeChatlog(doc)).sessions[0]!.messages
    expect(written[0]!.tags).toBeUndefined()
    expect(written[1]!.tags).toEqual(['只修改第二条'])
  })
})

describe('所有文档操作的撤销与重做', () => {
  const firstId = () => useAppStore.getState().doc!.messages[0]!.id
  const secondId = () => useAppStore.getState().doc!.messages[1]!.id

  it.each([
    [
      '收藏',
      () => useAppStore.getState().patchMessages([firstId()], { starred: true }, '收藏记录'),
    ],
    [
      '个人信息',
      () =>
        useAppStore
          .getState()
          .patchMessages(
            [firstId()],
            { tags: ['学习', '日常'], reactions: ['🌤️'], mood: '平静', states: ['专注'] },
            '修改详情',
          ),
    ],
    [
      '正文、模型与用量',
      () =>
        useAppStore.getState().patchMessages(
          [secondId()],
          {
            content: '**新版正文**\n\n尾段',
            model: '测试模型',
            meta: { custom_extension: { nested: ['保留', 42] } },
          },
          '修改记录',
        ),
    ],
    [
      '完整 Token 用量与模型信息',
      () =>
        useAppStore.getState().patchMessages(
          [secondId()],
          {
            modelInfo: { id: 'fixture-model', name: '测试模型', reasoningEffort: 'high' },
            usage: {
              input_tokens: 123,
              output_tokens: 45,
              cache_read_tokens: 67,
              cache_write_tokens: 8,
              reasoning_tokens: 9,
              total_tokens: 168,
              custom_tokens: 6,
            },
          },
          '用量与模型',
        ),
    ],
    [
      '思考、过程和检索块',
      () =>
        useAppStore.getState().patchMessages(
          [secondId()],
          {
            parts: [
              {
                id: 'p1',
                kind: 'reasoning',
                text: '虚构的思考过程',
                data: { duration_seconds: 12 },
              },
              { id: 'p2', kind: 'commentary', text: '虚构的过程说明' },
              {
                id: 'p3',
                kind: 'search',
                data: {
                  query: '虚构问题',
                  results: [{ title: '示例结果', url: 'https://example.com/' }],
                },
              },
              { id: 'p4', kind: 'answer', text: '第二段' },
            ],
          },
          '编辑过程',
        ),
    ],
    [
      '附件顺序与属性',
      () =>
        useAppStore.getState().patchMessages(
          [firstId()],
          {
            attachments: [
              {
                kind: 'image',
                name: '第二张',
                path: 'assets/b.png',
                meta: { caption: '示例说明' },
              },
              { kind: 'file', name: '第一份', path: 'assets/a.txt', meta: { extension: 123 } },
            ],
          },
          '调整附件',
        ),
    ],
    [
      '批注',
      () =>
        useAppStore
          .getState()
          .patchMessages(
            [firstId()],
            { annotations: [{ id: 'annotation-test', text: '虚构批注', quote: '第一段' }] },
            '添加批注',
          ),
    ],
    ['单条删除', () => useAppStore.getState().deleteMessages([firstId()])],
    ['批量删除', () => useAppStore.getState().deleteMessages([firstId(), secondId()])],
    ['复制', () => useAppStore.getState().duplicateMessage(firstId())],
    ['排序', () => useAppStore.getState().reorderMessage(firstId(), 1)],
    ['移动', () => useAppStore.getState().moveMessages([firstId()], '2026-09-21')],
    [
      '日期标题与标记',
      () =>
        useAppStore.getState().patchSession(0, {
          date: '2026-09-22',
          title: '新的一天',
          tags: ['日期标签'],
          mood: '晴朗',
        }),
    ],
    [
      '自定义文档字段',
      () =>
        useAppStore.getState().mutate('文档信息', (doc) => {
          doc.meta.extension = { list: ['A', { value: '未知扩展值' }] }
        }),
    ],
    [
      '标签管理',
      () =>
        useAppStore.getState().mutate('标签管理', (doc) => {
          doc.meta.tag_colors = { 测试: '#eef' }
          doc.sessions[0]!.tags = ['测试']
        }),
    ],
    ['筛选预设', () => useAppStore.getState().saveView('只看测试')],
    [
      '整文源码',
      () =>
        useAppStore
          .getState()
          .commitText(
            SOURCE.replaceAll('\n', '\r\n') + '\r\n<!-- 未知扩展，完整保留 -->\r\n',
            '编辑源文件',
          ),
    ],
  ])('%s 操作完整往返正文、所有字段及阅读锚点', (_name, act) => {
    const initialIds = useAppStore.getState().doc!.messages.map((message) => message.id)
    act()
    const edited = useAppStore.getState().text
    const editedIds = useAppStore.getState().doc!.messages.map((message) => message.id)
    expect(edited).not.toBe(SOURCE)
    expect(useAppStore.getState().past).toHaveLength(1)
    const entry = useAppStore.getState().past[0]!
    expect(useAppStore.getState().getHistoryTexts(entry.id)).toEqual({
      before: SOURCE,
      after: edited,
    })
    for (let cycle = 0; cycle < 3; cycle++) {
      useAppStore.getState().undo()
      expect(useAppStore.getState().text).toBe(SOURCE)
      expect(useAppStore.getState().doc!.messages.map((message) => message.id)).toEqual(initialIds)
      useAppStore.getState().redo()
      expect(useAppStore.getState().text).toBe(edited)
      expect(useAppStore.getState().doc!.messages.map((message) => message.id)).toEqual(editedIds)
    }
  })

  it('无 ID 的收藏、移动与多次编辑不改变消息锚点', async () => {
    const id = firstId()
    useAppStore.getState().patchMessages([id], { starred: true }, '收藏')
    expect(firstId()).toBe(id)
    useAppStore.getState().patchMessages([id], { tags: ['测试'] }, '标签')
    await useAppStore
      .getState()
      .saveMessage(
        { ...useAppStore.getState().doc!.messages[0]!, date: '2026-09-19', content: '编辑正文' },
        id,
      )
    expect(firstId()).toBe(id)
    expect(useAppStore.getState().jumpTarget).toBeNull()
    useAppStore.getState().moveMessages([id], '2026-09-23')
    expect(
      useAppStore.getState().doc!.messages.find((message) => message.content === '编辑正文')!.id,
    ).toBe(id)
  })

  it('添加记录和后续编辑均可精确撤销，不污染相邻记录', async () => {
    const oldIds = useAppStore.getState().doc!.messages.map((message) => message.id)
    await useAppStore
      .getState()
      .saveMessage({ date: '2026-09-19', role: 'user', content: '新记录' }, undefined, oldIds[0])
    const added = useAppStore.getState().text
    const newId = useAppStore.getState().doc!.messages[1]!.id
    expect(useAppStore.getState().doc!.messages.map((message) => message.id)).toEqual([
      oldIds[0],
      newId,
      oldIds[1],
    ])
    await useAppStore
      .getState()
      .saveMessage({ date: '2026-09-20', role: 'ai', content: '修改新记录' }, newId)
    const edited = useAppStore.getState().text
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(added)
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(SOURCE)
    useAppStore.getState().redo()
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(edited)
  })

  it('撤销后新编辑舍弃旧分支，重复提交和边界排序不清空重做', () => {
    const a = SOURCE.replace('第一段', '修改 A')
    const b = SOURCE.replace('第一段', '修改 B')
    useAppStore.getState().commitText(a, 'A')
    useAppStore.getState().commitText(b, 'B')
    useAppStore.getState().undo()
    useAppStore.getState().commitText(a, '没有变化')
    useAppStore.getState().reorderMessage(firstId(), -1)
    useAppStore.getState().mutate('没有变化', () => {})
    expect(useAppStore.getState().future).toHaveLength(1)
    const abandonedId = useAppStore.getState().future[0]!.id
    useAppStore.getState().patchMessages([firstId()], { mood: '新分支' })
    const branch = useAppStore.getState().text
    expect(useAppStore.getState().future).toHaveLength(0)
    expect(useAppStore.getState().getHistoryTexts(abandonedId)).toBeNull()
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(branch)
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(a)
  })

  it('原样保存记录、赋予相同字段不会产生历史或抹掉重做分支', async () => {
    useAppStore.getState().commitText(SOURCE.replace('第一段', '可重做'), '待重做')
    useAppStore.getState().undo()
    const message = useAppStore.getState().doc!.messages[0]!
    await useAppStore.getState().saveMessage(createMessageDraft(message, '2026-09-19'), message.id)
    useAppStore.getState().patchMessages([message.id], { content: message.content }, '内容未改')
    expect(useAppStore.getState().text).toBe(SOURCE)
    expect(useAppStore.getState().past).toHaveLength(0)
    expect(useAppStore.getState().future).toHaveLength(1)
  })

  it('超过旧40步上限仍能撤销到原文并完整重做', () => {
    for (let index = 0; index < 80; index++)
      useAppStore.getState().commitText(SOURCE.replace('第一段', `第 ${index} 步`), `操作 ${index}`)
    const final = useAppStore.getState().text
    expect(useAppStore.getState().past).toHaveLength(80)
    for (let index = 0; index < 80; index++) useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(SOURCE)
    for (let index = 0; index < 80; index++) useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(final)
  })

  it('混合编辑、复制、删除、移动、排序 96 步逐步往返到每一个中间状态', () => {
    const capture = () => ({
      text: useAppStore.getState().text,
      ids: useAppStore.getState().doc!.messages.map((message) => message.id),
    })
    const states = [capture()]
    for (let index = 0; index < 96; index++) {
      const state = useAppStore.getState()
      const messages = state.doc!.messages
      const selected = messages[index % messages.length]!
      const before = state.text
      switch (index % 8) {
        case 0:
          state.patchMessages(
            [selected.id],
            { content: `${selected.content}\n第 ${index} 次修改` },
            '编辑正文',
          )
          break
        case 1:
          state.duplicateMessage(selected.id)
          break
        case 2:
          state.patchMessages(
            [selected.id],
            { tags: [`标记 ${index}`], starred: !selected.starred },
            '编辑标记',
          )
          break
        case 3:
          state.moveMessages([selected.id], `2026-09-${20 + (index % 7)}`)
          break
        case 4:
          state.reorderMessage(selected.id, -1)
          break
        case 5:
          if (messages.length > 1) state.deleteMessages([selected.id])
          break
        case 6:
          state.patchSession(selected.sessionIndex, { title: `日期注记 ${index}`, mood: '平静' })
          break
        case 7:
          state.mutate('文档设置', (doc) => {
            doc.meta.title = `测试日记 ${index}`
          })
          break
      }
      if (useAppStore.getState().text !== before) states.push(capture())
    }
    expect(states.length).toBeGreaterThan(70)
    for (let index = states.length - 2; index >= 0; index--) {
      useAppStore.getState().undo()
      expect(capture()).toEqual(states[index])
    }
    for (const expected of states.slice(1)) {
      useAppStore.getState().redo()
      expect(capture()).toEqual(expected)
    }
  })

  it('重命名/移除标签、删除筛选与恢复版本也全部进入可逆历史', () => {
    useAppStore.getState().patchMessages([firstId()], { tags: ['旧标签'] }, '添加标签')
    useAppStore.getState().setFilters({ tag: '旧标签' })
    useAppStore.getState().saveView('旧标签视图')
    const beforeRename = useAppStore.getState().text
    useAppStore.getState().renameTag('旧标签', '新标签')
    const renamed = useAppStore.getState().text
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(beforeRename)
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(renamed)
    const views = useAppStore.getState().rawDoc!.meta.saved_views as { id: string }[]
    useAppStore.getState().removeView(views[0]!.id)
    const removed = useAppStore.getState().text
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(renamed)
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(removed)
    const revision = useAppStore.getState().revisions.at(-1)!
    useAppStore.getState().restoreRevision(revision.id)
    expect(useAppStore.getState().text).toBe(SOURCE)
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(removed)
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(SOURCE)
  })

  it('整文插入一条记录后，原有无 ID 记录仍保持阅读锚点', () => {
    const originalIds = useAppStore.getState().doc!.messages.map((message) => message.id)
    useAppStore
      .getState()
      .commitText(
        SOURCE.replace('## 🧑‍💻 @user', '## 🧑‍💻 @user\n\n新增的开头\n\n## 🧑‍💻 @user'),
        '源文件插入',
      )
    expect(
      useAppStore
        .getState()
        .doc!.messages.slice(1)
        .map((message) => message.id),
    ).toEqual(originalIds)
    useAppStore.getState().undo()
    expect(useAppStore.getState().doc!.messages.map((message) => message.id)).toEqual(originalIds)
  })

  it('刷新恢复两个历史栈、锚点及未写入附件，操作与文档隔离', async () => {
    const file = new File(['虚构附件'], 'sample.txt', { type: 'text/plain' })
    const [attachment] = await useAppStore.getState().addAttachments([file])
    const id = firstId()
    useAppStore.getState().patchMessages([id], { attachments: [attachment!] }, '添加附件')
    const withAttachment = useAppStore.getState().text
    useAppStore.getState().patchMessages([id], { mood: '平静' }, '心情')
    useAppStore.getState().undo()
    await useAppStore.getState().saveDraft()
    const saved = vi.mocked(workspace.persistWorkspace).mock.calls.at(-1)![0]
    expect(saved.past).toHaveLength(1)
    expect(saved.future).toHaveLength(1)
    expect(saved.assets).toEqual([[attachment!.path, file]])
    useAppStore.getState().loadText('another.chat.md', SOURCE.replace('第一段', '另一份日记'))
    expect(useAppStore.getState().past).toHaveLength(0)
    vi.mocked(workspace.workspaceFor).mockResolvedValue(saved)
    await useAppStore.getState().openWorkspace(saved.key)
    expect(firstId()).toBe(id)
    expect(useAppStore.getState().text).toBe(withAttachment)
    useAppStore.getState().undo()
    expect(useAppStore.getState().text).toBe(SOURCE)
    expect(useAppStore.getState().assets.get(attachment!.path!)).toBe(file)
    useAppStore.getState().redo()
    expect(useAppStore.getState().text).toBe(withAttachment)
    useAppStore.getState().redo()
    expect(useAppStore.getState().doc!.messages[0]!.mood).toBe('平静')
  })

  it('保存到磁盘不抹掉历史；撤销/重做跨过保存点时基线保持磁盘内容', async () => {
    const handle = handleWith(SOURCE)
    useAppStore.setState({ fileHandle: handle })
    useAppStore.getState().patchMessages([firstId()], { starred: true }, '收藏')
    const saved = useAppStore.getState().text
    vi.mocked(fileAccess.writeFile).mockImplementationOnce(async () => {
      vi.mocked(handle.getFile).mockResolvedValue(new File([saved], handle.name))
    })
    await useAppStore.getState().saveFile()
    expect(useAppStore.getState().past).toHaveLength(1)
    useAppStore.getState().undo()
    expect(useAppStore.getState()).toMatchObject({ text: SOURCE, baseline: saved })
    useAppStore.getState().redo()
    expect(useAppStore.getState()).toMatchObject({ text: saved, baseline: saved })
  })
})
