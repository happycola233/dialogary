import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

/** highlight.js 转义原始文本后生成高亮标记，JSON 中的 HTML 只会作为文字展示。 */
export function JsonPreview({ text, className = '' }: { text: string; className?: string }) {
  const highlighted = useMemo(() => hljs.highlight(text, { language: 'json' }).value, [text])
  return (
    <pre
      tabIndex={0}
      aria-label="JSON 预览"
      className={`dg-json-preview hc-scrollbar ${className}`}
    >
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}
