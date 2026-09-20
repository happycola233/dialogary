import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseFile, chooseSaveFile, writeAsset, writeFile } from './fileAccess'

afterEach(() => vi.unstubAllGlobals())

function writer() {
  const stream = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) }
  const handle = { createWritable: vi.fn().mockResolvedValue(stream) } as unknown as FileSystemFileHandle
  return { stream, handle }
}

describe('文件写入边界', () => {
  it('提交完整文件后关闭流，不追加到旧内容', async () => {
    const { handle, stream } = writer()
    await writeFile(handle, '新正文')
    expect(stream.write).toHaveBeenCalledExactlyOnceWith('新正文')
    expect(stream.close).toHaveBeenCalledOnce()
    expect(stream.abort).not.toHaveBeenCalled()
  })

  it('写入或提交失败中止临时流并把失败交给界面', async () => {
    const { handle, stream } = writer()
    const error = new DOMException('存储空间不足', 'QuotaExceededError')
    stream.write.mockRejectedValue(error)
    await expect(writeFile(handle, '正文')).rejects.toBe(error)
    expect(stream.abort).toHaveBeenCalledOnce()
    expect(stream.close).not.toHaveBeenCalled()
  })

  it.each(['../outside.png', '/root.png', 'assets/../../outside.png', 'assets//bad.png', 'C:/outside.png', 'assets/./bad.png'])('拒绝越过授权目录的路径 %s', async (path) => {
    const getDirectoryHandle = vi.fn()
    await expect(writeAsset({ getDirectoryHandle } as unknown as FileSystemDirectoryHandle, path, new File(['image'], 'test.png'))).rejects.toThrow('附件路径无效')
    expect(getDirectoryHandle).not.toHaveBeenCalled()
  })

  it('附件保存在传入的 Markdown 父目录，并保持字面文件名', async () => {
    const { handle, stream } = writer()
    const assetDir = { getFileHandle: vi.fn().mockRejectedValueOnce(new DOMException('不存在', 'NotFoundError')).mockResolvedValueOnce(handle) }
    const root = { getDirectoryHandle: vi.fn().mockResolvedValue(assetDir) }
    const file = new File(['abc'], '照片 100%.png')
    await writeAsset(root as unknown as FileSystemDirectoryHandle, 'assets/照片 100%.png', file)
    expect(root.getDirectoryHandle).toHaveBeenCalledExactlyOnceWith('assets', { create: true })
    expect(assetDir.getFileHandle).toHaveBeenLastCalledWith('照片 100%.png', { create: true })
    expect(stream.write).toHaveBeenCalledWith(file)
  })

  it('同名不同内容附件不覆盖，同内容可重试', async () => {
    const createWritable = vi.fn()
    const existing = { getFile: async () => new File(['old'], 'same.png'), createWritable }
    const directory = { getFileHandle: vi.fn().mockResolvedValue(existing) } as unknown as FileSystemDirectoryHandle
    await expect(writeAsset(directory, 'same.png', new File(['new'], 'same.png'))).rejects.toThrow('内容不同')
    await expect(writeAsset(directory, 'same.png', new File(['old'], 'same.png'))).resolves.toBeUndefined()
    expect(createWritable).not.toHaveBeenCalled()
  })

  it('选择器保留 Window 接收者，取消与不支持是不同结果', async () => {
    const fakeWindow = {
      showOpenFilePicker: vi.fn(function (this: unknown) { expect(this).toBe(fakeWindow); return Promise.resolve([]) }),
      showSaveFilePicker: vi.fn().mockRejectedValue(new DOMException('取消', 'AbortError')),
    }
    vi.stubGlobal('window', fakeWindow)
    expect(await chooseFile()).toBeNull()
    expect(await chooseSaveFile('日记.md')).toBeNull()
    vi.stubGlobal('window', {})
    expect(await chooseFile()).toBeUndefined()
  })
})
