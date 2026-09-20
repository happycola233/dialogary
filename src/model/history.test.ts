import { describe, expect, it } from 'vitest'
import { applyHistoryEntry, createHistoryEntry, historyTexts } from './history'

describe('精确可逆文本补丁', () => {
  it.each([
    ['', '第一行\r\n😀'],
    ['正文\n', ''],
    ['同样的前缀\r\n旧字\r\n末尾  ', '同样的前缀\r\n新字\r\n末尾  '],
    ['a😀b', 'a😌b'],
    ['相同', '相同'],
    ['重复重复重复', '重复新重复'],
  ])('完整往返：%j → %j', (before, after) => {
    const entry = createHistoryEntry(before, after, '测试', ['one'], ['one'])
    expect(applyHistoryEntry(before, entry, 'redo')).toBe(after)
    expect(applyHistoryEntry(after, entry, 'undo')).toBe(before)
  })

  it('长文局部编辑只存改动区间，不重复存整篇日记', () => {
    const prefix = '保留的内容\n'.repeat(20_000)
    const before = prefix + '旧' + prefix
    const after = prefix + '新' + prefix
    expect(createHistoryEntry(before, after, '测试', [], []).patch).toEqual({
      offset: prefix.length,
      before: '旧',
      after: '新',
    })
  })

  it('任意历史详情在光标前后均给出同一份完整对照', () => {
    const states = ['初始\n', '初始\n第二段', '编辑\n第二段', '编辑\n']
    const entries = states
      .slice(1)
      .map((text, index) => createHistoryEntry(states[index]!, text, `操作 ${index}`, [], []))
    for (let cursor = 0; cursor <= entries.length; cursor++) {
      for (const [index, entry] of entries.entries())
        expect(
          historyTexts(states[cursor]!, entries.slice(0, cursor), entries.slice(cursor), entry.id),
        ).toEqual({ before: states[index], after: states[index + 1] })
    }
    expect(historyTexts(states[0]!, [], entries, 'missing')).toBeNull()
  })

  it('不同位置连续修改 250 步后，全部撤销和重做保持原始字节文本', () => {
    let current = '第一段\r\n保留\n结尾\r\n'
    const original = current
    const entries = []
    for (let index = 0; index < 250; index++) {
      const offset = index % (current.length + 1)
      const next = current.slice(0, offset) + `🙂${index}\n` + current.slice(offset + (index % 3))
      entries.push(createHistoryEntry(current, next, '测试', [], []))
      current = next
    }
    const final = current
    for (const entry of entries.toReversed()) current = applyHistoryEntry(current, entry, 'undo')
    expect(current).toBe(original)
    for (const entry of entries) current = applyHistoryEntry(current, entry, 'redo')
    expect(current).toBe(final)
  })
})
