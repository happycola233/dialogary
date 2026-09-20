import { describe, expect, it } from 'vitest'
import { selectionToolbarPosition, visibleSelectionAnchor } from './selectionGeometry'

const viewport = { top: 100, bottom: 800, left: 0, right: 1200 }

describe('摘录工具条定位', () => {
  it('跨屏长选区使用可见行，完全离开阅读区时隐藏', () => {
    const rects = [
      { top: 20, bottom: 40, left: 250, right: 600 },
      { top: 130, bottom: 150, left: 250, right: 620 },
      { top: 850, bottom: 870, left: 250, right: 630 },
    ]
    expect(visibleSelectionAnchor(rects, viewport)).toEqual(rects[1])
    expect(visibleSelectionAnchor([rects[0]!, rects[2]!], viewport)).toBeNull()
  })
  it('一行包含粗体、链接等分片时取同一行右缘', () => {
    expect(
      visibleSelectionAnchor(
        [
          { top: 220, bottom: 244, left: 300, right: 400 },
          { top: 220, bottom: 244, left: 400, right: 570 },
          { top: 248, bottom: 272, left: 300, right: 650 },
        ],
        viewport,
      ),
    ).toEqual({ top: 220, bottom: 244, left: 300, right: 570 })
  })
  it('上方空间不足时放在选区下方，手机两侧保持可见', () => {
    const mobile = { top: 90, bottom: 780, left: 0, right: 390 }
    expect(
      selectionToolbarPosition({ top: 100, bottom: 125, left: 8, right: 50 }, mobile, 118, 44),
    ).toEqual({ left: 8, top: 133 })
    expect(
      selectionToolbarPosition({ top: 700, bottom: 724, left: 200, right: 450 }, mobile, 118, 44),
    ).toEqual({ left: 264, top: 648 })
  })
})
