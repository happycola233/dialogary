import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeftRight,
  Check,
  Columns2,
  FileCheck2,
  List,
  Minus,
  Plus,
  Save,
  UnfoldVertical,
} from 'lucide-react'
import { buildChangeReview, pairReviewLines, type ReviewLine } from '../model/changeReview'
import { useAppStore } from '../model/store'
import { EditorDialog, mutedButtonClass, primaryButtonClass } from '../editor/EditorDialog'

function LineContent({ row }: { row: ReviewLine }) {
  return (
    <>
      {row.emphasis?.map((part, index) =>
        part.changed ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      ) ??
        (row.text || ' ')}
      {row.ending === '' && <span className="dg-diff-eol">无末尾换行</span>}
      {row.ending === '\r\n' && row.kind !== 'context' && <span className="dg-diff-eol">CRLF</span>}
    </>
  )
}

function DiffCell({ row, side }: { row: ReviewLine | null; side: 'before' | 'after' }) {
  return (
    <div className={`dg-diff-cell ${row ? `is-${row.kind}` : 'is-empty'}`}>
      <span className="dg-diff-line-number" aria-hidden="true">
        {row?.[side === 'before' ? 'beforeLine' : 'afterLine']}
      </span>
      <span className="dg-diff-sign" aria-hidden="true">
        {row?.kind === 'added' ? '+' : row?.kind === 'removed' ? '−' : ''}
      </span>
      <code>{row && <LineContent row={row} />}</code>
    </div>
  )
}

function DiffRows({ rows, layout }: { rows: ReviewLine[]; layout: 'split' | 'unified' }) {
  const [limit, setLimit] = useState(180)
  const shown = rows.slice(0, limit)
  const pairs = useMemo(() => pairReviewLines(shown), [shown])
  return (
    <>
      <div className={`dg-diff-code is-${layout}`}>
        {layout === 'split'
          ? pairs.map((pair, index) => (
              <div key={index} className="dg-diff-pair">
                <DiffCell row={pair.before} side="before" />
                <DiffCell row={pair.after} side="after" />
              </div>
            ))
          : shown.map((row, index) => (
              <DiffCell key={index} row={row} side={row.kind === 'removed' ? 'before' : 'after'} />
            ))}
      </div>
      {rows.length > limit && (
        <button className="dg-diff-expand" onClick={() => setLimit(limit + 180)}>
          <ArrowDown size={14} />
          继续显示 · 还有 {rows.length - limit} 行
        </button>
      )}
    </>
  )
}

export function ChangeReview({
  before,
  after,
  beforeLabel = '修改前',
  afterLabel = '修改后',
  onSwap,
}: {
  before: string
  after: string
  beforeLabel?: string
  afterLabel?: string
  /** 两侧都可作为基准时提供，由调用方交换内容与标签。 */
  onSwap?: () => void
}) {
  const review = useMemo(() => buildChangeReview(before, after), [before, after])
  const [layout, setLayout] = useState<'split' | 'unified'>(() =>
    window.innerWidth < 760 ? 'unified' : 'split',
  )
  const [showAll, setShowAll] = useState(false)
  return (
    <div className="dg-change-review">
      <div className="dg-diff-toolbar">
        <div className="dg-diff-summary" aria-live="polite">
          <strong>
            {review.hunks.length} <span>处改动</span>
          </strong>
          <span className="dg-diff-add">
            <Plus size={13} />
            {review.added} 行
          </span>
          <span className="dg-diff-remove">
            <Minus size={13} />
            {review.removed} 行
          </span>
        </div>
        <div className="dg-diff-options">
          {onSwap && (
            <button
              className="dg-icon"
              aria-label="互换左右两侧"
              data-tooltip={`互换左右：${afterLabel}在左`}
              onClick={onSwap}
            >
              <ArrowLeftRight size={16} />
            </button>
          )}
          <button
            className="dg-icon"
            aria-label={showAll ? '仅显示改动' : '显示完整上下文'}
            aria-pressed={showAll}
            onClick={() => setShowAll(!showAll)}
          >
            <UnfoldVertical size={16} />
          </button>
          <div className="dg-diff-layout" aria-label="差异布局">
            <button
              aria-pressed={layout === 'split'}
              aria-label="并排对照"
              onClick={() => setLayout('split')}
            >
              <Columns2 size={14} />
              <span>并排</span>
            </button>
            <button
              aria-pressed={layout === 'unified'}
              aria-label="逐行对照"
              onClick={() => setLayout('unified')}
            >
              <List size={14} />
              <span>逐行</span>
            </button>
          </div>
        </div>
      </div>
      {before === after ? (
        <div className="dg-diff-empty">
          <span>
            <Check size={28} strokeWidth={1.5} />
          </span>
          <h3>内容完全一致</h3>
          <p>没有待保存的改动。</p>
        </div>
      ) : (
        <>
          <div className="dg-diff-legend">
            <span>
              <i className="is-before" />
              {beforeLabel}
            </span>
            <span>
              <i className="is-after" />
              {afterLabel}
            </span>
          </div>
          <div className="dg-diff-scroll hc-scrollbar" aria-label="文件差异">
            {showAll ? (
              <DiffRows key="all" rows={review.rows} layout={layout} />
            ) : (
              review.hunks.map((hunk) => (
                <section key={hunk.id} className="dg-diff-hunk">
                  {hunk.hiddenBefore > 0 && (
                    <div className="dg-diff-gap">{hunk.hiddenBefore} 行未改动</div>
                  )}
                  <header>
                    <span>{hunk.title}</span>
                    <div>
                      {hunk.fields.map((field) => (
                        <span key={field} className="dg-diff-field">
                          {field}
                        </span>
                      ))}
                    </div>
                    <small>第 {hunk.afterStart ?? hunk.beforeStart} 行</small>
                  </header>
                  <DiffRows
                    key={`${hunk.id}:${before.length}:${after.length}`}
                    rows={hunk.rows}
                    layout={layout}
                  />
                </section>
              ))
            )}
            {!showAll && review.hiddenAfter > 0 && (
              <div className="dg-diff-gap">{review.hiddenAfter} 行未改动</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function SaveReviewDialog({ asNew, onClose }: { asNew: boolean; onClose: () => void }) {
  const state = useAppStore()
  const errors = state.doc?.issues.filter((issue) => issue.level === 'error') ?? []
  const direct = Boolean(state.fileHandle) && !asNew
  return (
    <EditorDialog
      fixedHeight
      title="确认本次保存"
      subtitle={state.sourceName ?? '新的日记'}
      onClose={onClose}
      footer={
        <>
          <div className="dg-save-review-note">
            <FileCheck2 size={17} />
            <span>
              {errors.length
                ? `还有 ${errors.length} 处格式问题需要修正`
                : direct
                  ? '确认后写回已连接的文件'
                  : '确认后选择位置保存副本'}
            </span>
          </div>
          <button className={mutedButtonClass} onClick={onClose}>
            继续编辑
          </button>
          <button
            className={primaryButtonClass}
            disabled={errors.length > 0 || state.fileStatus === 'saving'}
            onClick={() => {
              // 文件选择器必须直接接在用户点击之后；差异计算已在打开窗口时完成。
              onClose()
              void state.saveFile(asNew)
            }}
          >
            <Save size={16} />
            {direct ? '确认保存文件' : '确认保存副本'}
          </button>
        </>
      }
    >
      <ChangeReview
        before={state.baseline}
        after={state.text}
        beforeLabel={state.fileHandle ? '上次保存的文件' : '打开时的文件'}
        afterLabel="当前草稿"
      />
    </EditorDialog>
  )
}
