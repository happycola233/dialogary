import { Markdown } from '../markdown/Markdown'
import { MESSAGE_BODY_TEXT_CLASS } from '../markdown/messageStyles'
import type { MessagePart } from '../parser/types'
import { safePageUrl } from '../process/searchActivity'

function sourceText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : ''
}

export function CitationSources({ part }: { part: MessagePart }) {
  // Markdown 是作者提供的阅读稿；仅在没有阅读稿时从元数据生成视图，避免重复来源。
  if (part.text?.trim())
    return (
      <section aria-label="来源" className="my-3">
        <Markdown text={part.text} variant="message" />
      </section>
    )

  const results = Array.isArray(part.data?.results) ? part.data.results : []
  const sources = results.flatMap((result: unknown) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return []
    const record = result as Record<string, unknown>
    const title = sourceText(record.title)
    const url = sourceText(record.url)
    const snippet = sourceText(record.snippet)
    return title || url || snippet ? [{ title, url, snippet }] : []
  })
  if (!sources.length) return null

  return (
    <section aria-label="来源" className="my-3">
      <div className={`hc-md [overflow-wrap:anywhere] ${MESSAGE_BODY_TEXT_CLASS}`}>
        <p><strong>来源</strong></p>
        <ol>
          {sources.map((source, index) => {
            const href = safePageUrl(source.url)
            const label = source.title || source.url
            return (
              <li key={index}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    title={source.url}
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    {label}
                  </a>
                ) : label ? <span>{label}</span> : null}
                {source.snippet && (
                  <p className="whitespace-pre-wrap text-neutral-500 dark:text-neutral-400">
                    {source.snippet}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
