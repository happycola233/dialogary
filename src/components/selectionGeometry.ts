export interface SelectionBounds {
  top: number
  right: number
  bottom: number
  left: number
}

/** 长摘录跨出屏幕时，工具条仍靠近当前可见的第一行，而非整条消息的边界。 */
export function visibleSelectionAnchor(
  rectangles: SelectionBounds[],
  viewport: SelectionBounds,
): SelectionBounds | null {
  const visible = rectangles.filter(
    (rect) =>
      rect.right > rect.left &&
      rect.bottom > rect.top &&
      rect.bottom > viewport.top &&
      rect.top < viewport.bottom &&
      rect.right > viewport.left &&
      rect.left < viewport.right,
  )
  if (!visible.length) return null
  const firstTop = Math.min(...visible.map((rect) => Math.max(rect.top, viewport.top)))
  const firstLine = visible.filter((rect) => Math.max(rect.top, viewport.top) < firstTop + 2)
  return {
    top: firstTop,
    left: Math.max(viewport.left, Math.min(...firstLine.map((rect) => rect.left))),
    right: Math.min(viewport.right, Math.max(...firstLine.map((rect) => rect.right))),
    bottom: Math.min(viewport.bottom, Math.max(...firstLine.map((rect) => rect.bottom))),
  }
}

export function selectionToolbarPosition(
  anchor: SelectionBounds,
  viewport: SelectionBounds,
  width: number,
  height: number,
): { left: number; top: number } {
  const edge = 8
  const gap = 8
  const above = anchor.top - height - gap
  return {
    left: Math.max(
      viewport.left + edge,
      Math.min(anchor.right - width, viewport.right - width - edge),
    ),
    top: Math.max(
      viewport.top + edge,
      Math.min(
        above >= viewport.top + edge ? above : anchor.bottom + gap,
        viewport.bottom - height - edge,
      ),
    ),
  }
}
