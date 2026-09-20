/* eslint-disable react-refresh/only-export-components -- ProcessTrack 需与搜索行共用纯汇总函数。 */
import { Globe, MessagesSquare, Search, TextSearch, UserSearch } from 'lucide-react'
import type { SearchAction } from '../process/searchActivity'
import { summarizeSearchActions, xPostUrl, safePageUrl, isXSearchActionType } from '../process/searchActivity'
import { XLogo } from '../process/XLogo'

/**
 * 过程轨中的单条检索动作，以及 ProcessTrack 共用的状态/汇总口径。
 *
 * 口径（见上游实测）：web_search / x_search 都不是贯穿思考的持续状态，而是 0~N 个
 * 离散调用，两次调用之间模型仍在推理；两类调用共用同一条时间线以保留真实交错顺序。
 * 本地档案只呈现已保存的动作，不显示实时加载骨架或重播入场动画。
 */

/** 页面显示为「主机名+路径」：同站多个页面（如 github.com 下多篇）不会看起来是重复行。 */
function pageLabelOf(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const path = parsed.pathname.replace(/\/$/, '')
    return path ? `${host}${path}` : host
  } catch {
    return url
  }
}

/**
 * 完成后的汇总：读作「已搜索 N 个关键词 · 在 X 检索 K 次 · 浏览 M 个页面」。
 * 返回分段而不是整串，是为了让窄屏（手机）只在「·」处换行——
 * 汇总一长就会折行，CJK 允许任意字间断行，整串渲染会掉出「串」这样的孤字尾行。
 */
export function searchSummaryPhrases(actions: SearchAction[]): string[] {
  if (actions.length === 0) return []
  const summary = summarizeSearchActions(actions)
  const phrases: string[] = []
  if (summary.webQueryCount) phrases.push(`搜索 ${summary.webQueryCount} 个关键词`)
  if (summary.xSearchCount) phrases.push(`在 X 检索 ${summary.xSearchCount} 次`)
  if (summary.pageCount) phrases.push(`浏览 ${summary.pageCount} 个页面`)
  if (summary.xThreadCount) phrases.push(`读取 ${summary.xThreadCount} 个 X 讨论串`)
  const failedSearchCount = actions.filter((action) => Boolean(action.error)).length
  if (failedSearchCount) phrases.push(`${failedSearchCount} 次搜索失败`)
  if (phrases.length) return phrases
  // 搜索确实发生过、但上游没回传任何查询词：只陈述发生了检索，不编造计数。
  return [summary.blindSearchCount ? '搜索网页' : '完成检索']
}

/**
 * X 关键词检索的排序模式：上游给的是英文枚举。
 * 必须译成「按…排序」这样自解释的短语——限定条件会跟在搜索词后面单独成段，
 * 光一个「最新」读者根本不知道在说什么。
 */
const X_SEARCH_MODE_LABELS: Record<string, string> = {
  Latest: '按最新排序',
  Top: '按热门排序',
}

export function SearchStepIcon({ action }: { action: SearchAction | null }) {
  const className = 'h-3.5 w-3.5'
  if (!action) return <Globe className={className} />
  switch (action.type) {
    case 'search':
      return <Search className={className} />
    case 'find_in_page':
      return <TextSearch className={className} />
    case 'open_page':
      return <Globe className={className} />
    case 'x_user_search':
      return <UserSearch className={className} />
    case 'x_thread_fetch':
      return <MessagesSquare className={className} />
    // x_keyword_search / x_semantic_search / 未知 x_* 子工具：直接用品牌标记
    default:
      return isXSearchActionType(action.type) ? (
        <XLogo className="h-3 w-3" />
      ) : (
        <Search className={className} />
      )
  }
}

/** 单个查询词 chip：沿用 HappyChat 的轻量外观，超长时保留完整 title。 */
function QueryChip({ query }: { query: string }) {
  return (
    <span
      className="hc-search-chip max-w-[18rem] truncate rounded-full px-2.5 text-xs leading-[22px]"

      title={query}
    >
      {query}
    </span>
  )
}

/** web_search 一次调用可含多条查询词。 */
function QueryChips({ queries }: { queries: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 py-0.5">
      {queries.map((query, index) => (
        <QueryChip key={`${query}-${index}`} query={query} />
      ))}
    </div>
  )
}

/**
 * x_search 的限定条件（账号 / 时间范围 / 排序）拼成一段自解释短语。
 * 每一项都要能脱离上下文读懂：跟在搜索词 chip 后面时可能因换行独占一行。
 */
function xSearchScopeText(action: SearchAction): string | null {
  const scopes: string[] = []
  if (action.handles?.length) scopes.push(`仅 ${action.handles.map((h) => `@${h}`).join(' ')}`)
  if (action.excludedHandles?.length) {
    scopes.push(`排除 ${action.excludedHandles.map((h) => `@${h}`).join(' ')}`)
  }
  if (action.fromDate || action.toDate) {
    scopes.push(`${action.fromDate ?? '不限'} ~ ${action.toDate ?? '今天'}`)
  }
  if (action.mode) scopes.push(X_SEARCH_MODE_LABELS[action.mode] ?? `按 ${action.mode} 排序`)
  return scopes.length ? scopes.join(' · ') : null
}

/** 与 chip 同处一行的次要说明：小一号、更浅，靠 chip 基线对齐而不是自成一行。 */
function StepMeta({ text }: { text: string }) {
  return (
    <span className="min-w-0 [overflow-wrap:anywhere] text-[12px] leading-[22px] text-neutral-400 dark:text-neutral-500">
      {text}
    </span>
  )
}

const linkClass =
  'text-neutral-600 underline-offset-2 transition-colors hover:text-neutral-950 hover:underline dark:text-neutral-300 dark:hover:text-neutral-50'

function PageLink({ url }: { url: string }) {
  const href = safePageUrl(url)
  if (!href) return <span>{url}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" title={url} className={linkClass}>
      {pageLabelOf(url)}
    </a>
  )
}

const stepTextClass =
  'block min-w-0 [overflow-wrap:anywhere] text-[13px] leading-6 text-neutral-500 dark:text-neutral-400'

export function SearchStepContent({ action }: { action: SearchAction | null }) {
  if (!action) return <span className={stepTextClass}>检索网页</span>

  const queries = action.queries ?? []

  switch (action.type) {
    case 'search':
      if (action.error) {
        return (
          <span className="block min-w-0 [overflow-wrap:anywhere] text-[13px] leading-6 text-red-500 dark:text-red-400">
            搜索失败（{action.error}）
          </span>
        )
      }
      if (!queries.length) return <span className={stepTextClass}>检索网页</span>
      return <QueryChips queries={queries} />

    case 'open_page':
      return <span className={stepTextClass}>阅读 {action.url ? <PageLink url={action.url} /> : '网页'}</span>

    case 'find_in_page':
      return (
        <span className={stepTextClass}>
          在 {action.url ? <PageLink url={action.url} /> : '页面'} 中查找
          {action.pattern ? (
            <span className="text-neutral-600 dark:text-neutral-300">「{action.pattern}」</span>
          ) : null}
        </span>
      )

    case 'x_user_search':
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
          <span className="shrink-0 text-[13px] leading-[22px] text-neutral-500 dark:text-neutral-400">
            查找 X 用户
          </span>
          {queries.map((query, index) => (
            <QueryChip key={`${query}-${index}`} query={query} />
          ))}
        </div>
      )

    case 'x_thread_fetch':
      return (
        <span className={stepTextClass}>
          读取 X 讨论串
          {action.postId ? (
            <>
              {' '}
              <a
                href={xPostUrl(action.postId)}
                target="_blank"
                rel="noreferrer"
                title={xPostUrl(action.postId)}
                className={linkClass}
              >
                #{action.postId}
              </a>
            </>
          ) : null}
        </span>
      )

    // x_keyword_search / x_semantic_search / 未知 x_* 子工具
    default: {
      if (!isXSearchActionType(action.type)) {
        return queries.length ? (
          <QueryChips queries={queries} />
        ) : (
          <span className={stepTextClass}>检索资料</span>
        )
      }
      // 限定条件与搜索词同处一个 flex-wrap 行：空间够时贴在 chip 右侧读作
      // 「搜索词 + 限定」，不够时才换行——不再无条件另起一行留下一个孤零零的短语。
      const scope = xSearchScopeText(action)
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
          {queries.length ? (
            queries.map((query, index) => <QueryChip key={`${query}-${index}`} query={query} />)
          ) : (
            <span className="text-[13px] leading-[22px] text-neutral-500 dark:text-neutral-400">
              {action.type === 'x_semantic_search' ? '语义检索 X' : '检索 X'}
            </span>
          )}
          {scope ? <StepMeta text={scope} /> : null}
        </div>
      )
    }
  }
}
