import { describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { downloadBlob } from '../data/fileAccess'
import type { ChatDoc, Message } from '../parser/types'
import { exportArchive, localReferences } from './archive'

vi.mock('../data/fileAccess', () => ({ downloadBlob: vi.fn() }))

function documentWith(message: Partial<Message>, dayNote?: string): ChatDoc {
  return {
    format: 'chatlog-md/2',
    meta: {},
    issues: [],
    sessions: [
      {
        date: '2026-09-19',
        title: null,
        meta: {},
        line: 1,
        annotations: dayNote ? [{ id: 'day', text: dayNote }] : [],
        messages: [
          {
            role: 'user',
            time: null,
            timePrecision: null,
            model: null,
            meta: {},
            thinking: null,
            attachments: [],
            content: '',
            line: 1,
            ...message,
          },
        ],
      },
    ],
  }
}

describe('完整归档的本地引用', () => {
  it('识别引用式图片、本地文件链接、括号、空格及 HTML 图片，忽略代码示例', () => {
    const doc = documentWith({
      content: [
        '![括号](assets/a(b).png)',
        '![空格](<assets/a b.png>)',
        '[文档](assets/note.pdf)',
        '![封面][cover]',
        '[cover]: assets/cover.png',
        '<img src="assets/html.png">',
        '`![示例](assets/inline.png)`',
        '```md',
        '![示例](assets/fenced.png)',
        '```',
      ].join('\n\n'),
    })
    expect(localReferences(doc).sort()).toEqual(
      ['assets/a(b).png', 'assets/a b.png', 'assets/note.pdf', 'assets/cover.png', 'assets/html.png'].sort(),
    )
  })
  it('文件名里的百分号和 URI 编码保留正确的实际文件名', () => {
    const doc = documentWith({
      attachments: [
        { kind: 'file', name: '一', path: 'assets/100%.txt', meta: {} },
        { kind: 'file', name: '二', path: 'assets/a%23b.txt', meta: {} },
        { kind: 'file', name: '三', path: 'assets/a%20b.txt', meta: {} },
      ],
    })
    expect(localReferences(doc)).toEqual(['assets/100%.txt', 'assets/a#b.txt', 'assets/a b.txt'])
  })
  it('消息批注与当天批注中的图片都随归档保存', () => {
    const doc = documentWith(
      { annotations: [{ id: 'message', text: '![照片](assets/message.png)' }] },
      '![当天](assets/day.png)',
    )
    expect(localReferences(doc).sort()).toEqual(['assets/day.png', 'assets/message.png'])
  })
  it('无法封装的父目录附件要明确失败，不能悄悄遗漏', () => {
    const doc = documentWith({
      attachments: [{ kind: 'file', name: '其他目录', path: '../notes.txt', meta: {} }],
    })
    expect(() => localReferences(doc)).toThrow()
  })
  it('编码后的越界或 Windows 绝对路径同样拒绝', () => {
    for (const path of ['assets/%2e%2e/private.txt', '%5Cprivate.txt', 'C%3A%5Cprivate.txt']) {
      const doc = documentWith({ attachments: [{ kind: 'file', name: '文件', path, meta: {} }] })
      expect(() => localReferences(doc)).toThrow()
    }
  })
  it('ZIP 路径保留原始 Unicode 形式，避免解压后断开 Markdown 引用', () => {
    const path = 'assets/café.png'.normalize('NFD')
    const doc = documentWith({ attachments: [{ kind: 'image', name: '照片', path, meta: {} }] })
    expect(localReferences(doc)).toEqual([path])
  })
  it('远程链接保持外链，重复的本地附件只收集一次', () => {
    const doc = documentWith({
      content: '![远程](https://example.com/image.png)\n![本地](assets/local.png)',
      attachments: [{ kind: 'image', name: '本地', path: 'assets/local.png', meta: {} }],
    })
    expect(localReferences(doc)).toEqual(['assets/local.png'])
  })
  it('实际 ZIP 保留 Markdown 与附件原始字节', async () => {
    const text = '合成测试文档\r\n'
    const data = new Uint8Array([0, 1, 128, 255])
    const doc = documentWith({
      attachments: [{ kind: 'file', name: '数据', path: 'assets/data.bin', meta: {} }],
    })
    await exportArchive(
      'fixture.chat.md',
      text,
      doc,
      new Map([['assets/data.bin', new File([data], 'data.bin')]]),
      () => null,
    )
    const [, blob] = vi.mocked(downloadBlob).mock.calls.at(-1)!
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(strFromU8(entries['fixture.chat.md']!)).toBe(text)
    expect(entries['assets/data.bin']).toEqual(data)
  })
  it('完整路径缺失时，不使用阅读器提供的同名文件回退', async () => {
    const doc = documentWith({
      attachments: [{ kind: 'image', name: '同名照片', path: 'wanted/photo.png', meta: {} }],
    })
    await expect(
      exportArchive(
        'fixture.chat.md',
        '合成文档',
        doc,
        new Map([['other/photo.png', new File(['different'], 'photo.png')]]),
        () => 'blob:unrelated',
      ),
    ).rejects.toThrow('未找到')
  })
  it('服务器把缺失附件回退到 HTML 首页时，不输出伪造的完整归档', async () => {
    const doc = documentWith({
      attachments: [{ kind: 'file', name: '说明', path: 'assets/missing.html', meta: {} }],
    })
    const previousDownloads = vi.mocked(downloadBlob).mock.calls.length
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>应用首页</html>', { headers: { 'Content-Type': 'text/html' } }),
        ),
    )
    try {
      await expect(
        exportArchive(
          'fixture.chat.md',
          '合成文档',
          doc,
          new Map(),
          () => 'https://example.com/assets/missing.html',
        ),
      ).rejects.toThrow('未找到')
      expect(vi.mocked(downloadBlob).mock.calls).toHaveLength(previousDownloads)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
