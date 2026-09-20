/** 一次完整文档操作；只保存发生变化的连续区间，原始换行与空白也能逐字恢复。 */
export interface HistoryEntry {
  id: string
  label: string
  at: number
  patch: { offset: number; before: string; after: string }
  beforeIds: string[]
  afterIds: string[]
}

export interface HistoryTexts {
  before: string
  after: string
}

export function createHistoryEntry(
  before: string,
  after: string,
  label: string,
  beforeIds: string[],
  afterIds: string[],
): HistoryEntry {
  let offset = 0
  const shorter = Math.min(before.length, after.length)
  while (offset < shorter && before[offset] === after[offset]) offset++
  let suffix = 0
  while (
    suffix < shorter - offset &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++
  return {
    id: crypto.randomUUID(),
    label,
    at: Date.now(),
    patch: {
      offset,
      before: before.slice(offset, before.length - suffix),
      after: after.slice(offset, after.length - suffix),
    },
    beforeIds,
    afterIds,
  }
}

export function applyHistoryEntry(
  text: string,
  entry: HistoryEntry,
  direction: 'undo' | 'redo',
): string {
  const { offset, before, after } = entry.patch
  const removed = direction === 'undo' ? after : before
  const inserted = direction === 'undo' ? before : after
  return text.slice(0, offset) + inserted + text.slice(offset + removed.length)
}

/** 从当前光标逐步还原，详情预览与真正撤销使用同一份补丁。 */
export function historyTexts(
  text: string,
  past: HistoryEntry[],
  future: HistoryEntry[],
  id: string,
): HistoryTexts | null {
  let cursor = text
  for (let index = past.length - 1; index >= 0; index--) {
    const entry = past[index]!
    const before = applyHistoryEntry(cursor, entry, 'undo')
    if (entry.id === id) return { before, after: cursor }
    cursor = before
  }
  cursor = text
  for (const entry of future) {
    const after = applyHistoryEntry(cursor, entry, 'redo')
    if (entry.id === id) return { before: cursor, after }
    cursor = after
  }
  return null
}
