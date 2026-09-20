import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  History,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import { useAppStore } from '../model/store'
import { buildChangeReview, describeChange } from '../model/changeReview'
import { EditorDialog, mutedButtonClass, primaryButtonClass } from '../editor/EditorDialog'
import { downloadText } from '../data/fileAccess'
import { ChangeReview } from './ChangeReview'

export function HistoryControls() {
  const state = useAppStore()
  const undo = state.past.at(-1)
  const redo = state.future[0]
  const detail = useMemo(() => {
    return [undo, redo].map((entry) => {
      const texts = entry ? state.getHistoryTexts(entry.id) : null
      return texts ? describeChange(buildChangeReview(texts.before, texts.after)) : ''
    })
  }, [undo, redo, state.getHistoryTexts])
  return (
    <div className="dg-history-controls" aria-label="编辑历史">
      <button
        className="dg-icon"
        aria-label={undo ? `撤销：${undo.label}` : '撤销'}
        data-tooltip={undo ? `撤销 ${undo.label} · ${detail[0]}（Ctrl+Z）` : '暂无可撤销的操作'}
        disabled={!undo}
        onClick={state.undo}
      >
        <Undo2 size={17} />
      </button>
      <button
        className="dg-icon"
        aria-label={redo ? `重做：${redo.label}` : '重做'}
        data-tooltip={
          redo ? `重做 ${redo.label} · ${detail[1]}（Ctrl+Shift+Z / Ctrl+Y）` : '暂无可重做的操作'
        }
        disabled={!redo}
        onClick={state.redo}
      >
        <Redo2 size={17} />
      </button>
      <button
        className="dg-history-open"
        aria-label="查看编辑历史"
        data-tooltip="查看每一步的具体改动"
        onClick={() => state.setPanel('history')}
      >
        <History size={15} />
        <span>{undo?.label ?? (redo ? '已撤销' : '编辑历史')}</span>
        <ChevronDown size={12} />
      </button>
    </div>
  )
}

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const state = useAppStore()
  const [mode, setMode] = useState<'steps' | 'versions'>('steps')
  const [selected, setSelected] = useState<string | null>(null)
  const entries = [...state.past, ...state.future]
  const entry = entries.find((item) => item.id === selected) ?? state.past.at(-1) ?? state.future[0]
  const revision = state.revisions.find((item) => item.id === selected) ?? state.revisions[0]
  const texts = useMemo(
    () =>
      mode === 'versions'
        ? revision
          ? { before: state.text, after: revision.text }
          : null
        : entry
          ? state.getHistoryTexts(entry.id)
          : null,
    [mode, revision, state.text, entry, state.getHistoryTexts],
  )
  const undone = entry && state.future.some((item) => item.id === entry.id)
  return (
    <EditorDialog
      fixedHeight
      title="编辑历史"
      subtitle="每一步改动，都可以展开对照。"
      onClose={onClose}
      footer={
        <>
          <span className="dg-history-footer-note">
            {state.past.length} 步已应用 · {state.future.length} 步可重做
          </span>
          {mode === 'versions' && revision ? (
            <button
              className={primaryButtonClass}
              disabled={revision.text === state.text}
              onClick={() => {
                state.restoreRevision(revision.id)
                setMode('steps')
                setSelected(null)
              }}
            >
              <RotateCcw size={15} />
              恢复这个版本
            </button>
          ) : (
            <>
              <button
                className={mutedButtonClass}
                disabled={!state.past.length}
                onClick={() => {
                  setSelected(state.past.at(-1)!.id)
                  state.undo()
                }}
              >
                <Undo2 size={16} />
                撤销一步
              </button>
              <button
                className={mutedButtonClass}
                disabled={!state.future.length}
                onClick={() => {
                  setSelected(state.future[0]!.id)
                  state.redo()
                }}
              >
                <Redo2 size={16} />
                重做一步
              </button>
            </>
          )}
          <button className={primaryButtonClass} onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="dg-history-workspace">
        <aside className="dg-history-sidebar">
          <div className="dg-history-modes">
            <button
              aria-pressed={mode === 'steps'}
              onClick={() => {
                setMode('steps')
                setSelected(null)
              }}
            >
              操作记录
            </button>
            <button
              aria-pressed={mode === 'versions'}
              onClick={() => {
                setMode('versions')
                setSelected(null)
              }}
            >
              历史版本
            </button>
          </div>
          <div className="dg-history-list hc-scrollbar">
            {mode === 'steps' ? (
              <>
                {[...state.future].reverse().map((item) => (
                  <button
                    className="dg-history-step is-undone"
                    key={item.id}
                    aria-pressed={entry?.id === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="dg-history-dot">
                      <Redo2 size={12} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>已撤销 · {formatTime(item.at)}</small>
                    </span>
                    <ArrowRight size={13} />
                  </button>
                ))}
                {state.future.length > 0 && <div className="dg-history-position">当前进度</div>}
                {[...state.past].reverse().map((item, index) => (
                  <button
                    className="dg-history-step"
                    key={item.id}
                    aria-pressed={entry?.id === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="dg-history-dot">
                      {index === 0 ? <Check size={12} /> : state.past.length - index}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{formatTime(item.at)}</small>
                    </span>
                    <ArrowRight size={13} />
                  </button>
                ))}
                {entries.length === 0 && (
                  <p className="dg-history-list-empty">开始编辑后，每一步会出现在这里。</p>
                )}
              </>
            ) : (
              state.revisions.map((item) => (
                <button
                  className="dg-history-step"
                  key={item.id}
                  aria-pressed={revision?.id === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <span className="dg-history-dot">
                    <History size={12} />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{formatTime(item.at)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
        <div className="dg-history-detail">
          {texts ? (
            <>
              <div className="dg-history-detail-heading">
                <div>
                  <h3>{mode === 'versions' ? revision?.label : entry?.label}</h3>
                  <span>
                    {mode === 'versions'
                      ? '恢复前，请查看与当前草稿的差异。'
                      : undone
                        ? '此操作已撤销，下方保留原始改动对照。'
                        : '已应用到当前草稿'}
                  </span>
                </div>
                {mode === 'versions' && revision && (
                  <button
                    className="dg-icon"
                    aria-label="下载这个版本"
                    onClick={() => downloadText(state.sourceName!, revision.text)}
                  >
                    <Download size={16} />
                  </button>
                )}
              </div>
              <ChangeReview
                key={`${mode}:${mode === 'steps' ? entry?.id : revision?.id}`}
                before={texts.before}
                after={texts.after}
                beforeLabel={mode === 'versions' ? '当前草稿' : '操作前'}
                afterLabel={mode === 'versions' ? '历史版本' : '操作后'}
              />
            </>
          ) : (
            <div className="dg-diff-empty">
              <span>
                <History size={28} strokeWidth={1.5} />
              </span>
              <h3>还没有编辑记录</h3>
              <p>保存记录、整理标签或添加批注后，可在这里查看改动。</p>
            </div>
          )}
        </div>
      </div>
    </EditorDialog>
  )
}

function formatTime(at: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at)
}
