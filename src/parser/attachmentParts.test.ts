import { describe, expect, it } from 'vitest'
import { syncAttachmentParts } from './attachmentParts'
import type { Attachment, MessagePart } from './types'

const attachment = (name: string, meta = {}): Attachment => ({
  kind: 'image',
  name,
  path: `assets/${name}.png`,
  meta,
})
const part = (name: string): MessagePart => ({
  kind: 'attachment',
  id: `part-${name}`,
  text: `${name} 的说明`,
  data: { ...attachment(name), caption: `${name} 的标题`, extension: { retained: true } },
})
const answer = (text: string): MessagePart => ({ kind: 'answer', text })

describe('附件列表与内容块同步', () => {
  it('原样附件保持原对象，不补空 meta 和原来省略的 path', () => {
    const source: MessagePart = { kind: 'attachment', data: { kind: 'image', name: '未连接图片' } }
    const next = syncAttachmentParts(
      [source],
      [{ kind: 'image', name: '未连接图片', path: null, meta: {} }],
    )
    expect(next[0]).toBe(source)
    expect(next[0]!.data).not.toHaveProperty('meta')
    expect(next[0]!.data).not.toHaveProperty('path')
  })

  it('删除第一张不搬动跨正文的第二张，保留第二张自己的扩展字段', () => {
    const a = part('a'),
      b = part('b'),
      between = answer('两张图片之间的文字')
    expect(syncAttachmentParts([a, between, b], [attachment('b')])).toEqual([between, b])
  })

  it('交换顺序时 ID、说明和未知属性跟随各自的附件', () => {
    const a = part('a'),
      b = part('b'),
      between = answer('中间正文')
    expect(syncAttachmentParts([a, between, b], [attachment('b'), attachment('a')])).toEqual([
      b,
      between,
      a,
    ])
  })

  it('同时更名与改路径时按原顺序保留无法通过名称定位的扩展信息', () => {
    const a = part('a'),
      b = part('b')
    const next = syncAttachmentParts([a, b], [attachment('c'), attachment('d')])
    expect(next[0]).toEqual({ ...a, data: { ...a.data, name: 'c', path: 'assets/c.png' } })
    expect(next[1]).toEqual({ ...b, data: { ...b.data, name: 'd', path: 'assets/d.png' } })
  })

  it('重排同时更名或改路径时，仍匹配到原附件自己的内容块', () => {
    const a = part('a'),
      b = part('b'),
      c = part('c')
    const movedC = { ...attachment('c'), path: 'assets/c-moved.png' }
    const renamedA = { ...attachment('a'), name: 'a-renamed' }
    const next = syncAttachmentParts([a, b, c], [movedC, renamedA, attachment('b')])
    expect(next).toEqual([
      { ...c, data: { ...c.data, path: movedC.path } },
      { ...a, data: { ...a.data, name: renamedA.name } },
      b,
    ])
  })

  it('同路径同名称附件先用完整元数据区分身份，忽略元数据键顺序', () => {
    const a = { ...part('a'), data: { ...attachment('same', { order: 1, color: 'blue' }) } }
    const b = { ...part('b'), data: { ...attachment('same', { order: 2, color: 'red' }) } }
    expect(
      syncAttachmentParts(
        [a, b],
        [
          attachment('same', { color: 'red', order: 2 }),
          attachment('same', { color: 'blue', order: 1 }),
        ],
      ),
    ).toEqual([b, a])
  })

  it('新增图片在已有附件组后扩展，尾部正文保持在后方', () => {
    const a = part('a'),
      tail = answer('图片之后的文字')
    const next = syncAttachmentParts([a, tail], [attachment('a'), attachment('b')])
    expect(next).toEqual([a, { kind: 'attachment', data: attachment('b') }, tail])
  })

  it('新增附件在列表首部时，最终附件顺序与列表一致', () => {
    const a = part('a'),
      b = part('b'),
      tail = answer('结尾')
    const next = syncAttachmentParts(
      [a, b, tail],
      [attachment('c'), attachment('a'), attachment('b')],
    )
    expect(next).toEqual([{ kind: 'attachment', data: attachment('c') }, a, b, tail])
  })

  it('无原附件时追加到正文后，清空附件时只删除附件块', () => {
    const text = answer('正文')
    expect(syncAttachmentParts([text], [attachment('a')])).toEqual([
      text,
      { kind: 'attachment', data: attachment('a') },
    ])
    expect(syncAttachmentParts([part('a'), text, part('b')], [])).toEqual([text])
  })

  it('只改文件名称不补写空字段，也不改变输入对象', () => {
    const original: MessagePart = {
      kind: 'attachment',
      id: 'original',
      data: { kind: 'file', name: '旧名称', custom: 42 },
    }
    const before = structuredClone(original)
    const next = syncAttachmentParts(
      [original],
      [{ kind: 'file', name: '新名称', path: null, meta: {} }],
    )
    expect(next[0]).toEqual({ ...original, data: { ...original.data, name: '新名称' } })
    expect(original).toEqual(before)
  })

  it('保留解析器未投影为普通附件的未来内容块', () => {
    const future: MessagePart = {
      kind: 'attachment',
      data: { kind: 'future', opaque: ['unknown'] },
    }
    expect(syncAttachmentParts([future, part('a')], [])).toEqual([future])
  })
})
