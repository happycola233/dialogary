import { describe, expect, it } from 'vitest'
import { renamePreset, uniquePresets, usedPresets } from './presets'

describe('常用标签、心情与状态', () => {
  const document = {
    sessions: [
      {
        tags: [' 旅行 ', '旅行'],
        mood: '开心',
        states: ['放松'],
        messages: [
          { tags: ['旅行', '读书'], mood: '开心', states: ['放松', '放松'] },
          { tags: ['读书'], mood: '平静', states: ['专注'] },
        ],
      },
    ],
  }
  it('同时收集日期和记录，去掉空值和同一项内的重复值', () => {
    expect(usedPresets(document, 'tags')).toEqual([
      { value: '读书', count: 2 },
      { value: '旅行', count: 2 },
    ])
    expect(usedPresets(document, 'mood')[0]).toEqual({ value: '开心', count: 2 })
    expect(usedPresets(document, 'states')[0]).toEqual({ value: '放松', count: 2 })
  })
  it('收藏名称修改保留原位置，目标重名合并为一个选项', () => {
    expect(renamePreset(['旅行', '读书', '生活'], '旅行', '生活')).toEqual(['生活', '读书'])
    expect(renamePreset(['旅行', '读书'], '旅行', ' 徒步 ')).toEqual(['徒步', '读书'])
  })
  it('预设修改与文档内容互不影响', () => {
    const before = JSON.stringify(document)
    const values = usedPresets(document, 'tags').map((item) => item.value)
    renamePreset(values, '旅行', '徒步')
    expect(JSON.stringify(document)).toBe(before)
  })
  it('没有文档时仍可管理常用项，自定义中文和组合字符原样保留', () => {
    expect(usedPresets(null, 'mood')).toEqual([])
    expect(uniquePresets(['', ' 安心 ', '安心', '👨‍👩‍👦 陪伴'])).toEqual(['安心', '👨‍👩‍👦 陪伴'])
  })
})
