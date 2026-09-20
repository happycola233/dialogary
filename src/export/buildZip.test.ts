import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { buildZip, ZIP_MAX_ENTRIES } from './buildZip'

describe('有界并发 ZIP', () => {
  it('worker 压缩后仍保留调用者的输入缓冲区，并逐字节还原所有条目', async () => {
    const large = new Uint8Array(200_000).fill(65)
    const image = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const result = await buildZip([
      { path: 'large.txt', data: large },
      { path: 'assets/image.png', data: image },
    ])
    const entries = unzipSync(result)
    expect(large.byteLength).toBe(200_000)
    expect(entries['large.txt']).toEqual(large)
    expect(entries['assets/image.png']).toEqual(image)
  })
  it('拒绝 fflate 无法表示的条目数，避免生成损坏文件', async () => {
    const entry = { path: 'file.txt', data: new Uint8Array() }
    await expect(buildZip(Array.from({ length: ZIP_MAX_ENTRIES + 1 }, () => entry))).rejects.toThrow('上限')
  })
})
