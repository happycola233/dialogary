import { describe, expect, it } from 'vitest'
import type { DerivedMessage } from '../model/derive'
import { applyReplacementMatches, findReplacementMatches } from './findReplace'

const example = (patch: Partial<DerivedMessage> = {}): DerivedMessage => ({ role: 'user', time: null, timePrecision: null, model: null, meta: { custom: { keep: true } }, thinking: null, attachments: [], content: 'Hello hello Hello', line: 1, id: 'msg_test', index: 0, sessionIndex: 0, effectiveDate: '2026-09-19', effectiveTime: null, contentChars: 17, thinkingSeconds: null, ...patch })

describe('查找替换', () => {
  it('只替换所选位置，长度变化不会偏移其他命中', () => {
    const messages = [example()]
    const matches = findReplacementMatches(messages, 'hello', { scopes: ['body'], caseSensitive: false })
    const replacements = applyReplacementMatches(messages, [matches[0]!, matches[2]!], '你好呀')
    expect(replacements[0]?.message.content).toBe('你好呀 hello 你好呀')
    expect(replacements[0]?.message.meta).toEqual({ custom: { keep: true } })
    expect(messages[0]?.content).toBe('Hello hello Hello')
  })
  it('按字面查找正则特殊符号，并支持大小写区分', () => {
    expect(findReplacementMatches([example({ content: '[a]+ [A]+' })], '[a]+', { scopes: ['body'], caseSensitive: true })).toHaveLength(1)
  })
  it('有序内容只匹配一次并同步正文，不修改未知内容块', () => {
    const messages = [example({ content: 'hello', parts: [{ kind: 'answer', text: 'hello' }, { kind: 'commentary', text: 'hello' }, { kind: 'custom', text: 'hello', data: { future: true } }] })]
    const matches = findReplacementMatches(messages, 'hello', { scopes: ['body', 'commentary'], caseSensitive: false })
    expect(matches).toHaveLength(2)
    const updated = applyReplacementMatches(messages, matches, '')[0]!.message
    expect(updated.content).toBe('')
    expect(updated.parts?.[1]?.text).toBe('')
    expect(updated.parts?.[2]).toEqual(messages[0]?.parts?.[2])
  })
  it('批注替换保留原文摘录和扩展元数据', () => {
    const messages = [example({ annotations: [{ id: 'note_test', text: 'hello', quote: 'hello', anchor: { start: 1 } }] })]
    const matches = findReplacementMatches(messages, 'hello', { scopes: ['annotations'], caseSensitive: false })
    const note = applyReplacementMatches(messages, matches, 'hi')[0]!.message.annotations?.[0]
    expect(note).toEqual({ id: 'note_test', text: 'hi', quote: 'hello', anchor: { start: 1 } })
  })
  it('正文替换保留独立的历史模型原名', () => {
    const messages = [example({ model: '原始模型字符串', modelInfo: { id: 'example-model', name: '显示名称' } })]
    const matches = findReplacementMatches(messages, 'Hello', { scopes: ['body'], caseSensitive: true })
    const updated = applyReplacementMatches(messages, matches, '你好')[0]!.message
    expect(updated.model).toBe('原始模型字符串')
    expect(updated.modelInfo).toEqual(messages[0]!.modelInfo)
  })
})
