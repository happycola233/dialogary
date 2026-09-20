import { describe, expect, it } from 'vitest'
import { EditorState, type Transaction, type TransactionSpec } from '@codemirror/state'
import { history, undo, redo, undoDepth } from '@codemirror/commands'
import { markdownTransaction } from './markdownCommands'

function fixture(text: string, from = 0, to = text.length) {
  let state = EditorState.create({
    doc: text,
    selection: { anchor: from, head: to },
    extensions: [history()],
  })
  const target = {
    get state() {
      return state
    },
    dispatch(transaction: Transaction | TransactionSpec) {
      state = 'state' in transaction ? transaction.state : state.update(transaction).state
    },
  }
  return {
    get state() {
      return state
    },
    target,
  }
}

describe('Markdown 正文格式与编辑历史', () => {
  it('加粗保留中文与表情，撤销和重做逐字恢复', () => {
    const f = fixture('今天 ☁️ 心情平静')
    f.target.dispatch(markdownTransaction(f.state, 'bold'))
    expect(f.state.doc.toString()).toBe('**今天 ☁️ 心情平静**')
    expect(undo(f.target)).toBe(true)
    expect(f.state.doc.toString()).toBe('今天 ☁️ 心情平静')
    expect(redo(f.target)).toBe(true)
    expect(f.state.doc.toString()).toBe('**今天 ☁️ 心情平静**')
    f.target.dispatch(markdownTransaction(f.state, 'bold'))
    expect(f.state.doc.toString()).toBe('今天 ☁️ 心情平静')
  })

  it('格式操作不和相邻键入合并，分两次撤销', () => {
    const f = fixture('原文')
    f.target.dispatch({
      changes: { from: 2, insert: '追加' },
      selection: { anchor: 0, head: 4 },
      userEvent: 'input.type',
    })
    f.target.dispatch(markdownTransaction(f.state, 'italic'))
    expect(undoDepth(f.state)).toBe(2)
    undo(f.target)
    expect(f.state.doc.toString()).toBe('原文追加')
    undo(f.target)
    expect(f.state.doc.toString()).toBe('原文')
  })

  it('对跨行选择添加并取消列表，不改动未选中的下一行', () => {
    const f = fixture('第一行\n第二行\n保留', 0, 8)
    f.target.dispatch(markdownTransaction(f.state, 'list'))
    expect(f.state.doc.toString()).toBe('- 第一行\n- 第二行\n保留')
    f.target.dispatch(markdownTransaction(f.state, 'list'))
    expect(f.state.doc.toString()).toBe('第一行\n第二行\n保留')
  })

  it('插入链接选择地址，后续输入不会覆盖链接文字', () => {
    const f = fixture('查看日记')
    f.target.dispatch(markdownTransaction(f.state, 'link'))
    expect(f.state.doc.toString()).toBe('[查看日记](https://)')
    expect(f.state.sliceDoc(f.state.selection.main.from, f.state.selection.main.to)).toBe(
      'https://',
    )
  })

  it('多行代码使用围栏，二次点击取消围栏', () => {
    const f = fixture('const a = 1\nconst b = 2')
    f.target.dispatch(markdownTransaction(f.state, 'code'))
    expect(f.state.doc.toString()).toBe('```\nconst a = 1\nconst b = 2\n```')
    f.target.dispatch(markdownTransaction(f.state, 'code'))
    expect(f.state.doc.toString()).toBe('const a = 1\nconst b = 2')
  })
})
