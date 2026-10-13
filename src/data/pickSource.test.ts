import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assetsFromDirectory, createFileAssetResolver, pickDirectoryModern, sourceFromFiles, walkDirectoryHandle } from './pickSource'

const createUrl = vi.fn((file: Blob | MediaSource) => `blob:test-${file instanceof Blob ? file.size : 0}`)
beforeEach(() => { vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); createUrl.mockClear() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function fileHandle(name: string, text: string) {
  const file = new File([text], name)
  return { kind: 'file', name, getFile: vi.fn().mockResolvedValue(file) } as unknown as FileSystemFileHandle
}
function directory(name: string, entries: Record<string, FileSystemFileHandle | FileSystemDirectoryHandle>): FileSystemDirectoryHandle {
  return { kind: 'directory', name,
    getDirectoryHandle: vi.fn(async (name: string) => entries[name]),
    async *[Symbol.asyncIterator]() { yield* Object.entries(entries) },
  } as unknown as FileSystemDirectoryHandle
}

describe('附件路径解析', () => {
  it('缺失完整路径时不按同名文件误配', () => {
    const file = new File(['actual'], 'same.png')
    const resolve = createFileAssetResolver(new Map([['one/same.png', file]]))
    expect(resolve('two/same.png')).toBeNull()
    expect(resolve('same.png')).toBeNull()
    expect(resolve('one/same.png')).toBe('blob:test-6')
  })

  it('解码空格、中文、井号、NFC，并缓存 object URL', () => {
    const file = new File(['a'], '照片 #1.png')
    const resolve = createFileAssetResolver(new Map([['assets/照片 #1.png', file], ['assets/cafe\u0301.png', file]]))
    expect(resolve('./assets/%E7%85%A7%E7%89%87%20%231.png')).toBe('blob:test-1')
    expect(resolve('./assets/%E7%85%A7%E7%89%87%20%231.png')).toBe('blob:test-1')
    expect(resolve('assets/caf%C3%A9.png')).toBe('blob:test-1')
    expect(createUrl).toHaveBeenCalledTimes(2)
  })

  it('只接受唯一的大小写兼容匹配，歧义不猜测', () => {
    const first = new File(['a'], 'A.png')
    const second = new File(['bb'], 'a.png')
    const resolve = createFileAssetResolver(new Map([['Assets/A.png', first], ['assets/a.png', second]]))
    expect(resolve('Assets/A.png')).toBe('blob:test-1')
    expect(resolve('assets/a.png')).toBe('blob:test-2')
    expect(resolve('ASSETS/A.PNG')).toBeNull()
  })

  it('坏百分号不崩溃，字面百分号文件可读取，协议不能被误当本地路径', () => {
    const file = new File(['yes'], '100%.png')
    const resolve = createFileAssetResolver(new Map([['assets/100%.png', file]]))
    expect(resolve('assets/100%.png')).toBe('blob:test-3')
    expect(resolve('%not-valid')).toBeNull()
    expect(resolve('javascript:alert(1)')).toBeNull()
    expect(resolve('https://example.com/photo.png')).toBe('https://example.com/photo.png')
  })
})

describe('目录与 Markdown 所在位置', () => {
  it('重新关联时优先匹配当前日记名称，不能切换到更浅的另一份文件', async () => {
    const source = await sourceFromFiles([
      { relPath: '其他.chat.md', file: new File(['另一份正文'], '其他.chat.md') },
      { relPath: 'journal/当前.chat.md', file: new File(['当前正文'], '当前.chat.md') },
      { relPath: 'journal/assets/p.png', file: new File(['own'], 'p.png') },
      { relPath: 'assets/p.png', file: new File(['other'], 'p.png') },
    ], '当前.chat.md')
    expect(source?.name).toBe('当前.chat.md')
    expect(source?.text).toBe('当前正文')
    expect(createFileAssetResolver(source!.assets)('assets/p.png')).toBe('blob:test-3')
  })

  it('找不到当前日记或同名文件有歧义时返回 null，明确路径可消除歧义', async () => {
    const files = [
      { relPath: 'one/日记.chat.md', file: new File(['第一份'], '日记.chat.md') },
      { relPath: 'two/日记.chat.md', file: new File(['第二份'], '日记.chat.md') },
    ]
    expect(await sourceFromFiles(files, '不在这里.chat.md')).toBeNull()
    expect(await sourceFromFiles(files, '日记.chat.md')).toBeNull()
    expect((await sourceFromFiles(files, 'two/日记.chat.md'))?.text).toBe('第二份')
  })

  it('子目录附件相对聊天文件注册，兄弟目录附件不冒充同级文件', async () => {
    const diary = new File(['---\nformat: chatlog-md/2\n---'], 'diary.chat.md')
    const own = new File(['own'], 'p.png')
    const sibling = new File(['sibling'], 'p.png')
    const source = await sourceFromFiles([
      { relPath: 'journal/diary.chat.md', file: diary },
      { relPath: 'journal/assets/p.png', file: own },
      { relPath: 'assets/p.png', file: sibling },
      { relPath: '.dialogary-backups/old.chat.md', file: diary },
      { relPath: '.tmp/private.chat.md', file: diary },
    ])
    expect(source?.name).toBe('diary.chat.md')
    expect([...source!.assets.keys()]).toEqual(['assets/p.png', '../assets/p.png'])
    const resolve = createFileAssetResolver(source!.assets)
    expect(resolve('assets/p.png')).toBe('blob:test-3')
    expect(resolve('../assets/p.png')).toBe('blob:test-7')
    expect(resolve('wrong/p.png')).toBeNull()
  })

  it('只扫描目录时，当前附件的对象 URL 仍能读取', async () => {
    vi.mocked(URL.createObjectURL).mockRestore()
    vi.mocked(URL.revokeObjectURL).mockRestore()
    const photo = new File(['虚构附件'], 'photo.png')
    const diary = fileHandle('diary.chat.md', '虚构正文')
    const photoHandle = { kind: 'file', getFile: async () => photo } as FileSystemFileHandle
    const dir = directory('journal', { 'diary.chat.md': diary, 'photo.png': photoHandle })
    const resolve = createFileAssetResolver(new Map([['photo.png', photo]]))
    const url = resolve('photo.png')!
    expect(await (await fetch(url)).text()).toBe('虚构附件')

    expect((await assetsFromDirectory(dir, diary.name))?.get('photo.png')).toBe(photo)
    expect(resolve('photo.png')).toBe(url)
    expect(await (await fetch(url)).text()).toBe('虚构附件')
    createFileAssetResolver(new Map())
  })

  it('递归选择不会读备份、构建输出和依赖；写回基准是聊天父目录', async () => {
    const privateBackup = fileHandle('old.chat.md', '不应读取')
    const diary = fileHandle('diary.chat.md', '正文')
    const inner = directory('journal', { 'diary.chat.md': diary })
    const root = directory('selected', {
      '.dialogary-backups': directory('.dialogary-backups', { 'old.chat.md': privateBackup }),
      node_modules: directory('node_modules', { 'old.chat.md': privateBackup }),
      journal: inner,
    })
    const files = await walkDirectoryHandle(root)
    expect(files.map((file) => file.relPath)).toEqual(['journal/diary.chat.md'])
    expect(privateBackup.getFile).not.toHaveBeenCalled()
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn().mockResolvedValue(root) })
    const picked = await pickDirectoryModern()
    expect(picked?.handle).toBe(inner)
    expect(picked?.files[0]?.handle).toBe(diary)
  })

  it('取消选择安静返回，读取错误必须向界面报告', async () => {
    const picker = vi.fn().mockRejectedValueOnce(new DOMException('cancel', 'AbortError')).mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    vi.stubGlobal('window', { showDirectoryPicker: picker })
    expect(await pickDirectoryModern()).toBeNull()
    await expect(pickDirectoryModern()).rejects.toThrow('denied')
  })
})
