import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, drawSelection, dropCursor, keymap, placeholder } from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import {
  Bold,
  Code2,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link,
  List,
  ListTodo,
  PencilLine,
  Quote,
  Redo2,
  Search,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Markdown } from '../markdown/Markdown'
import { markdownTransaction, type MarkdownAction } from './markdownCommands'
import './markdown-editor.css'

const highlighting = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--dg-accent)', fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  {
    tag: [tags.link, tags.url],
    color: 'var(--dg-accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  { tag: tags.monospace, color: 'var(--dg-editor-code)' },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
    color: 'var(--dg-editor-muted)',
  },
])

const formats: { action: MarkdownAction; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { action: 'bold', label: '加粗', icon: Bold, shortcut: 'Ctrl / ⌘ B' },
  { action: 'italic', label: '斜体', icon: Italic, shortcut: 'Ctrl / ⌘ I' },
  { action: 'heading', label: '标题', icon: Heading2 },
  { action: 'quote', label: '引用', icon: Quote },
  { action: 'list', label: '无序列表', icon: List },
  { action: 'task', label: '待办列表', icon: ListTodo },
  { action: 'link', label: '链接', icon: Link, shortcut: 'Ctrl / ⌘ K' },
  { action: 'code', label: '代码', icon: Code2 },
]
const phrases = {
  Find: '查找',
  Replace: '替换为',
  next: '下一处',
  previous: '上一处',
  all: '全选匹配',
  'match case': '区分大小写',
  'by word': '全词匹配',
  regexp: '正则表达式',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭查找',
  Search: '查找正文',
  'No matches': '没有匹配内容',
}

export function MarkdownEditor({
  value,
  onChange,
  label = '正文',
  active = true,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  active?: boolean
  autoFocus?: boolean
}) {
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const initial = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('write')
  const [status, setStatus] = useState({ undo: 0, redo: 0, line: 1, column: 1, selected: 0 })

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          // 保留整个本次编辑的历史，离开弹窗后由记录级历史接管。
          history({ minDepth: Number.MAX_SAFE_INTEGER }),
          markdown(),
          syntaxHighlighting(highlighting),
          drawSelection(),
          dropCursor(),
          EditorView.lineWrapping,
          placeholder('写下此刻的生活与想法…'),
          search({ top: true }),
          EditorState.phrases.of(phrases),
          EditorView.contentAttributes.of({
            'aria-label': label,
            'aria-multiline': 'true',
            ...(autoFocus ? { 'data-editor-autofocus': 'true' } : {}),
            spellcheck: 'false',
          }),
          keymap.of([
            {
              key: 'Mod-b',
              run: (v) => {
                v.dispatch(markdownTransaction(v.state, 'bold'))
                return true
              },
            },
            {
              key: 'Mod-i',
              run: (v) => {
                v.dispatch(markdownTransaction(v.state, 'italic'))
                return true
              },
            },
            {
              key: 'Mod-k',
              run: (v) => {
                v.dispatch(markdownTransaction(v.state, 'link'))
                return true
              },
            },
            ...historyKeymap,
            ...searchKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) {
              const selection = update.state.selection.main
              const line = update.state.doc.lineAt(selection.head)
              setStatus({
                undo: undoDepth(update.state),
                redo: redoDepth(update.state),
                line: line.number,
                column: selection.head - line.from + 1,
                selected: selection.to - selection.from,
              })
            }
          }),
        ],
      }),
    })
    editor.current = view
    return () => {
      view.destroy()
      editor.current = null
    }
  }, [label, autoFocus])

  useEffect(() => {
    const view = editor.current!
    if (value !== view.state.doc.toString()) {
      // 来自源码或过程页的编辑同步到正文，不伪造为一次键入，也不清空已有编辑历史。
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      })
    }
  }, [value])
  useEffect(() => {
    if (active) editor.current?.requestMeasure()
  }, [active, mode])
  const run = (command: (view: EditorView) => void) => {
    const view = editor.current!
    command(view)
    view.focus()
  }

  return (
    <section className={`dg-markdown-editor dg-editor-${mode}`} aria-label={`${label}编辑器`}>
      <div className="dg-editor-toolbar">
        <div
          className="dg-editor-tools"
          role="toolbar"
          aria-label={`${label}格式`}
          hidden={mode === 'preview'}
        >
          {formats.map(({ action, label: name, icon: Icon, shortcut }) => (
            <button
              key={action}
              type="button"
              aria-label={name}
              title={shortcut ? `${name} · ${shortcut}` : name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run((v) => v.dispatch(markdownTransaction(v.state, action)))}
            >
              <Icon size={16} />
            </button>
          ))}
          <span className="dg-editor-tool-divider" />
          <button
            type="button"
            aria-label="撤销正文编辑"
            title="撤销正文编辑 · Ctrl / ⌘ Z"
            disabled={!status.undo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(undo)}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            aria-label="重做正文编辑"
            title="重做正文编辑 · Ctrl / ⌘ Shift Z"
            disabled={!status.redo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(redo)}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            aria-label="查找正文"
            title="查找正文 · Ctrl / ⌘ F"
            onClick={() => {
              openSearchPanel(editor.current!)
            }}
          >
            <Search size={16} />
          </button>
        </div>
        {mode === 'preview' && <span className="dg-editor-preview-label">阅读预览</span>}
        <div className="dg-editor-view-switch" aria-label="正文视图">
          {(
            [
              { id: 'write', label: '编辑', icon: PencilLine },
              { id: 'split', label: '对照', icon: Columns2 },
              { id: 'preview', label: '预览', icon: Eye },
            ] as const
          ).map(({ id, label: name, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              title={name}
            >
              <Icon size={14} />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="dg-editor-canvas">
        <div ref={parent} className="dg-editor-writing" hidden={mode === 'preview'} />
        {mode !== 'write' && (
          <div className="dg-editor-reading hc-scrollbar">
            <Markdown text={value || '还没有写下内容。'} />
          </div>
        )}
      </div>
      <div className="dg-editor-status">
        <span>
          {mode === 'preview' ? 'Markdown' : `第 ${status.line} 行，第 ${status.column} 列`}
        </span>
        <span>
          {status.selected > 0 && mode !== 'preview'
            ? `已选 ${status.selected.toLocaleString()} 字符 · `
            : ''}
          {value.length.toLocaleString()} 字符
        </span>
      </div>
    </section>
  )
}
