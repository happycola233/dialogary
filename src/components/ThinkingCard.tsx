import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Markdown } from '../markdown/Markdown'
import { splitReasoningSections } from '../markdown/reasoningSections'
import { useAppStore } from '../model/store'
import type { Thinking } from '../parser/types'
import { BrainIcon } from './BrainIcon'

/**
 * AI 思考摘要，样式对齐 happychat ReasoningCard：
 * 状态行（标签 + chevron）+ 分节正文（圆点标题 / 竖线正文的两列网格）。
 * 默认折叠；「展开全部思考」开关翻转默认值，单卡点击可覆盖。
 */
export function ThinkingCard({ thinking }: { thinking: Thinking }) {
  const expandAll = useAppStore((s) => s.expandAllThinking)
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? expandAll
  const sections = useMemo(() => splitReasoningSections(thinking.text), [thinking.text])
  const hasSummary = sections.length > 0
  const label = thinking.label || '思考过程'

  const statusContent = (
    <>
      <BrainIcon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      {hasSummary && (
        <ChevronDown
          className={clsx('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')}
        />
      )}
    </>
  )
  // 比正文小一号：这是元信息行，不该和消息正文抢注意力
  const statusClass =
    'hc-reasoning-status inline-flex items-center gap-2 text-[13px] leading-6 transition-colors'

  return (
    <div className="hc-reasoning mb-1.5 space-y-1">
      {hasSummary ? (
        <button
          type="button"
          onClick={() => setOverride(!open)}
          aria-expanded={open}
          aria-label={open ? '折叠推理摘要' : '展开推理摘要'}
          className={statusClass}
        >
          {statusContent}
        </button>
      ) : (
        <div className={statusClass}>{statusContent}</div>
      )}
      {hasSummary && (
        <div
          className={clsx(
            'hc-reasoning-collapse grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
          aria-hidden={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-2.5 pt-1 pr-2 pb-1">
              {sections.map((sec, i) => (
                <section key={i} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2">
                  {sec.title && (
                    <>
                      <span
                        aria-hidden
                        className="mt-[0.55rem] h-1.5 w-1.5 justify-self-center rounded-full bg-neutral-500 dark:bg-neutral-400"
                      />
                      <div className="text-sm leading-6 font-medium text-neutral-950 dark:text-neutral-100">
                        {sec.title}
                      </div>
                    </>
                  )}
                  {(sec.body || !sec.title) && (
                    <>
                      <span
                        aria-hidden
                        className={clsx(
                          'w-px justify-self-center bg-neutral-300 dark:bg-neutral-600',
                          sec.title && 'mt-1',
                        )}
                      />
                      <div className={clsx('min-w-0', sec.title && 'mt-1')}>
                        {sec.body && (
                          <Markdown text={sec.body} variant="reasoning" className="hc-reasoning-detail" />
                        )}
                      </div>
                    </>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
