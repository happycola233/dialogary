/** HappyChat 检索动作的持久化子集；数据来源于用户可编辑的 Markdown。 */
export interface SearchAction {
  type: string
  error?: string
  queries?: string[]
  url?: string
  pattern?: string
  handles?: string[]
  excludedHandles?: string[]
  fromDate?: string
  toDate?: string
  mode?: string
  postId?: string
}

export const isXSearchActionType = (type: string) => type.startsWith('x_')
export const xPostUrl = (postId: string) => `https://x.com/i/status/${encodeURIComponent(postId)}`

export function safePageUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function searchActionOf(kind: string, data: unknown): SearchAction {
  const record =
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const candidate =
    record.action && typeof record.action === 'object' && !Array.isArray(record.action)
      ? (record.action as Record<string, unknown>)
      : record
  const action: SearchAction = {
    type: typeof candidate.type === 'string' ? candidate.type : kind,
  }
  for (const key of ['error', 'url', 'pattern', 'fromDate', 'toDate', 'mode', 'postId'] as const) {
    if (typeof candidate[key] === 'string') action[key] = candidate[key]
  }
  for (const key of ['queries', 'handles', 'excludedHandles'] as const) {
    if (Array.isArray(candidate[key]))
      action[key] = candidate[key].filter((value): value is string => typeof value === 'string')
  }
  if (!action.queries && typeof candidate.query === 'string') action.queries = [candidate.query]
  return action
}

/** 与 HappyChat 一致：页面/讨论串去重，查询词保持每次实际调用的计数。 */
export function summarizeSearchActions(actions: readonly SearchAction[]) {
  let webQueryCount = 0
  let blindSearchCount = 0
  let xSearchCount = 0
  const pages = new Set<string>()
  const threads = new Set<string>()
  for (const action of actions) {
    switch (action.type) {
      case 'search':
        if (action.queries?.length) webQueryCount += action.queries.length
        else blindSearchCount++
        break
      case 'open_page':
      case 'find_in_page':
        pages.add(action.url || `${action.type}-${pages.size}`)
        break
      case 'x_thread_fetch':
        threads.add(action.postId || `thread-${threads.size}`)
        break
      default:
        if (isXSearchActionType(action.type)) xSearchCount++
    }
  }
  return {
    webQueryCount,
    blindSearchCount,
    pageCount: pages.size,
    xSearchCount,
    xThreadCount: threads.size,
  }
}
