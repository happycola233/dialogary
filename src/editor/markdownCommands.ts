import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'

export type MarkdownAction =
  'bold' | 'italic' | 'heading' | 'quote' | 'list' | 'task' | 'link' | 'code'

/** 每次格式操作是一条独立编辑历史，撤销时不会连带删掉刚刚输入的文字。 */
export function markdownTransaction(state: EditorState, action: MarkdownAction): TransactionSpec {
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)
  const annotation = { annotations: isolateHistory.of('full'), userEvent: 'input.format' }
  if (action === 'heading' || action === 'quote' || action === 'list' || action === 'task') {
    const prefix = { heading: '## ', quote: '> ', list: '- ', task: '- [ ] ' }[action]!
    const first = state.doc.lineAt(from)
    // 选区恰好停在下一行行首时，不把下一行也加上格式。
    const last = state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to)
    const lines = state.sliceDoc(first.from, last.to).split('\n')
    const remove = lines.every((line) => line.startsWith(prefix))
    const text = lines
      .map((line) => (remove ? line.slice(prefix.length) : prefix + line))
      .join('\n')
    return {
      ...annotation,
      changes: { from: first.from, to: last.to, insert: text },
      selection: EditorSelection.range(first.from, first.from + text.length),
    }
  }
  if (action === 'link') {
    const label = selected || '链接文字'
    const text = `[${label}](https://)`
    const anchor = from + label.length + 3
    return {
      ...annotation,
      changes: { from, to, insert: text },
      selection: EditorSelection.range(anchor, anchor + 8),
    }
  }
  const marker = action === 'bold' ? '**' : action === 'italic' ? '*' : '`'
  const opening = action === 'code' && selected.includes('\n') ? '```\n' : marker
  const closing = opening === '```\n' ? '\n```' : marker
  const around =
    state.sliceDoc(Math.max(0, from - opening.length), from) === opening &&
    state.sliceDoc(to, to + closing.length) === closing
  const within =
    selected.startsWith(opening) &&
    selected.endsWith(closing) &&
    selected.length >= opening.length + closing.length
  if (around || within) {
    const start = around ? from - opening.length : from
    const end = around ? to + closing.length : to
    const text = around ? selected : selected.slice(opening.length, -closing.length)
    return {
      ...annotation,
      changes: { from: start, to: end, insert: text },
      selection: EditorSelection.range(start, start + text.length),
    }
  }
  const text = selected || (action === 'code' ? '代码' : '文字')
  return {
    ...annotation,
    changes: { from, to, insert: opening + text + closing },
    selection: EditorSelection.range(from + opening.length, from + opening.length + text.length),
  }
}
