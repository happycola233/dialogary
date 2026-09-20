import { useId, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { CheckCircle2, ChevronDown, Globe } from 'lucide-react'
import { Markdown } from '../markdown/Markdown'
import { splitReasoningSections, type ReasoningSection } from '../markdown/reasoningSections'
import type { Thinking } from '../parser/types'
import { isXSearchActionType, searchActionOf } from '../process/searchActivity'
import { XLogo } from '../process/XLogo'
import { SearchStepContent, SearchStepIcon, searchSummaryPhrases } from './SearchStep'
import { reasoningLabel, reasoningSeconds } from '../process/reasoningTiming'
import '../process/process.css'

interface Part {
  id?: string
  kind: string
  text?: string
  data?: unknown
}
interface Props {
  parts?: Part[]
  thinking?: Thinking | null
  expanded?: boolean
}

/** 持久化过程轨复用 HappyChat 的行结构与视觉，省去实时生成状态。 */
export function ProcessTrack({ parts = [], thinking, expanded = false }: Props) {
  const contentId = useId()
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? expanded
  const steps = useMemo(() => {
    const ordered = parts.filter(
      (part) =>
        isProcessPart(part.kind) &&
        (isSearchPart(part.kind) || part.text?.trim() || reasoningSeconds(part) !== null),
    )
    // 显式 parts 可能只是回答前后的一组过程；兼容投影绝不能插入到另一组里。
    if (thinking?.text && parts.length === 0) {
      return [{ kind: 'reasoning', text: thinking.text }, ...ordered]
    }
    return ordered
  }, [parts, thinking])
  const actions = steps
    .filter((step) => isSearchPart(step.kind))
    .map((step) => searchActionOf(step.kind, step.data))
  const searchPhrases = searchSummaryPhrases(actions)
  const hasReasoning = steps.some((step) => step.kind === 'reasoning')
  const segments = hasReasoning
    ? [reasoningLabel(steps, thinking), ...searchPhrases]
    : searchPhrases.length
      ? [`已${searchPhrases[0]}`, ...searchPhrases.slice(1)]
      : ['已完成处理']
  const label = segments.join(' · ')
  const pureSearch = steps.every((step) => isSearchPart(step.kind))
  const xOnly = actions.length > 0 && actions.every((action) => isXSearchActionType(action.type))
  if (!steps.length) return null

  return (
    <div className="hc-reasoning mb-1.5" data-testid="process-track">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={open ? '折叠思考过程' : '展开思考过程'}
        className="hc-reasoning-status inline-flex items-start gap-2 text-left text-[15px] leading-7 transition-colors"
        data-testid="process-track-toggle"
      >
        {pureSearch && (
          <span className="flex h-7 shrink-0 items-center" aria-hidden>
            {xOnly ? <XLogo className="h-3 w-3" /> : <Globe className="h-3.5 w-3.5" />}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-1.5" data-testid="process-track-label">
          {segments.map((segment, index) => (
            <span key={index} className="inline-flex gap-x-1.5 whitespace-nowrap">
              {index > 0 && <span aria-hidden>·</span>}
              {segment}
            </span>
          ))}
        </span>
        <ChevronDown
          className={clsx(
            'mt-[7px] h-3.5 w-3.5 shrink-0 transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={contentId}
        className={clsx(
          'hc-reasoning-collapse grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <ol className="space-y-2 pt-2 pr-2 pb-1">
            {steps.flatMap((step, stepIndex) => {
              const key = step.id ?? `part-${stepIndex}`
              if (step.kind === 'reasoning')
                return splitReasoningSections(step.text ?? '').map((section, index) => (
                  <ReasoningRow key={`${key}-${index}`} section={section} />
                ))
              if (step.kind === 'commentary')
                return [<CommentaryRow key={key} text={step.text ?? ''} />]
              const action = searchActionOf(step.kind, step.data)
              return [
                <li
                  key={key}
                  className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2"
                  data-testid="search-step"
                  data-step-type={action.type}
                >
                  <span
                    className="mt-[5px] flex justify-center text-neutral-400 dark:text-neutral-500"
                    aria-hidden
                  >
                    <SearchStepIcon action={action} />
                  </span>
                  <div className="min-w-0">
                    <SearchStepContent action={action} />
                    {step.text && (
                      <Markdown
                        text={step.text}
                        variant="reasoning"
                        className="hc-reasoning-detail"
                      />
                    )}
                  </div>
                </li>,
              ]
            })}
            <li
              className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2 text-left"
              data-testid="reasoning-summary-footer"
            >
              <span
                className="mt-[5px] justify-self-center text-neutral-950 dark:text-neutral-100"
                aria-hidden
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm leading-6 font-medium text-neutral-950 dark:text-neutral-100">
                  {label}
                </div>
                <div className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
                  完成
                </div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}

const isSearchPart = (kind: string) =>
  ['search', 'open_page', 'find_in_page'].includes(kind) || isXSearchActionType(kind)
const isProcessPart = (kind: string) =>
  kind === 'reasoning' || kind === 'commentary' || isSearchPart(kind)

function ReasoningRow({ section }: { section: ReasoningSection }) {
  const hasBody = section.body.trim().length > 0
  return (
    <li className="hc-reasoning-section grid grid-cols-[14px_minmax(0,1fr)] gap-x-2">
      {section.title && (
        <>
          <span
            aria-hidden
            className="mt-[0.55rem] h-1.5 w-1.5 justify-self-center rounded-full bg-neutral-500 dark:bg-neutral-400"
          />
          <div className="text-sm leading-6 font-medium text-neutral-950 dark:text-neutral-100">
            {section.title}
          </div>
        </>
      )}
      {(hasBody || !section.title) && (
        <>
          <span
            aria-hidden
            className={clsx(
              'w-px justify-self-center bg-neutral-300 dark:bg-neutral-600',
              section.title && 'mt-1',
            )}
          />
          <div className={clsx('min-w-0', section.title && 'mt-1')}>
            {hasBody && (
              <Markdown text={section.body} variant="reasoning" className="hc-reasoning-detail" />
            )}
          </div>
        </>
      )}
    </li>
  )
}

function CommentaryRow({ text }: { text: string }) {
  return (
    <li
      className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2"
      data-testid="commentary-step"
    >
      <span className="mt-[5px] flex justify-center" aria-hidden>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
        >
          <path d="M16.279 13.793a2.487 2.487 0 1 1 0 4.975 2.487 2.487 0 0 1 0-4.975m0 1.33a1.158 1.158 0 1 0 0 2.315 1.158 1.158 0 0 0 0-2.315M9.997 1.233c1.867 0 3.501 1.243 3.838 2.966 1.791.094 3.303 1.462 3.303 3.25 0 1.18-.669 2.184-1.63 2.751q.006.105.008.211c0 2.262-1.987 3.995-4.31 3.995-.959 0-1.85-.292-2.57-.79a3.64 3.64 0 0 1-2.285.79c-1.875 0-3.499-1.402-3.499-3.255 0-.245.033-.484.088-.713-1.029-.792-1.706-1.992-1.706-3.359 0-2.466 2.168-4.365 4.714-4.365q.434.001.846.071c.714-.949 1.892-1.552 3.203-1.552m0 1.33c-1 0-1.844.506-2.27 1.212a.82.82 0 0 1-.894.374 3.8 3.8 0 0 0-.885-.105c-1.926 0-3.384 1.415-3.384 3.036 0 .998.541 1.903 1.413 2.466.334.215.457.63.32.985a1.7 1.7 0 0 0-.115.62c0 1.009.914 1.925 2.17 1.925.59 0 1.117-.209 1.502-.538l.215-.204a.82.82 0 0 1 1.075-.003 3.15 3.15 0 0 0 2.063.745c1.702 0 2.979-1.248 2.979-2.665q0-.19-.03-.373a.82.82 0 0 1 .471-.874l.133-.066c.649-.349 1.048-.972 1.048-1.648l-.01-.188c-.105-.932-.982-1.738-2.159-1.738q-.15 0-.297.019a.69.69 0 0 1-.772-.684c0-1.212-1.095-2.295-2.573-2.296" />
        </svg>
      </span>
      <Markdown text={text} variant="reasoning" className="hc-process-commentary min-w-0" />
    </li>
  )
}
