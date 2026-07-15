/**
 * 推理摘要分节（对齐 happychat reasoningSections.ts 的行为）：
 * 粗体独占一行（`**标题**`）视为小节标题，其余行累积为正文；围栏代码内不识别标题。
 * 标题作为纯文本单独渲染，正文走 Markdown —— 这也是「标题后正文不换行」问题的解法：
 * CommonMark 会把单个换行折叠成空格，分节后标题天然独占一行，无需 remark-breaks。
 */
export interface ReasoningSection {
  title: string | null
  body: string
}

const FENCE_RE = /^\s*(?:```|~~~)/
const TITLE_RE = /^\*\*([^*\r\n][^*\r\n]*?)\*\*$/

export function splitReasoningSections(text: string): ReasoningSection[] {
  const sections: ReasoningSection[] = []
  let title: string | null = null
  let lines: string[] = []
  let started = false
  let inFence = false

  const flush = () => {
    const body = lines.join('\n').trim()
    if (title !== null || body) sections.push({ title, body })
  }

  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) inFence = !inFence
    const matched = inFence ? null : (line.trim().match(TITLE_RE)?.[1]?.trim() ?? null)
    if (matched) {
      if (started) flush()
      title = matched
      lines = []
      started = true
    } else {
      lines.push(line)
      started = true
    }
  }
  if (started) flush()
  return sections
}
