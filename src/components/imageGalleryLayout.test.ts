import { describe, expect, it } from 'vitest'
import { imageGalleryLayout, type GalleryTile } from './imageGalleryLayout'

/** 核对可见几何约束，不锁定算法选择的分行数量。 */
function expectCompleteOrderedGallery(ratios: number[], width: number) {
  const original = [...ratios]
  const layout = imageGalleryLayout(ratios, width)
  expect(ratios).toEqual(original)
  expect(layout.tiles).toHaveLength(ratios.length)

  const rows: GalleryTile[][] = []
  for (const [index, tile] of layout.tiles.entries()) {
    expect(Number.isFinite(tile.x + tile.y + tile.width + tile.height)).toBe(true)
    expect(tile.width).toBeGreaterThan(0)
    expect(tile.height).toBeGreaterThan(0)
    expect(tile.width / tile.height).toBeCloseTo(ratios[index]!, 10)
    expect(tile.x).toBeGreaterThanOrEqual(0)
    expect(tile.y).toBeGreaterThanOrEqual(0)
    expect(tile.x + tile.width).toBeLessThanOrEqual(width + 1e-8)

    const row = rows.at(-1)
    if (row && row[0]!.y === tile.y) {
      const previous = row.at(-1)!
      expect(tile.x).toBeCloseTo(previous.x + previous.width + 8, 10)
      expect(tile.height).toBeCloseTo(previous.height, 10)
      row.push(tile)
    } else {
      expect(tile.x).toBe(0)
      expect(tile.y).toBeCloseTo(row ? row[0]!.y + row[0]!.height + 8 : 0, 10)
      rows.push([tile])
    }
  }

  const last = layout.tiles.at(-1)
  expect(layout.height).toBeCloseTo(last ? last.y + last.height : 0, 10)
  return { ...layout, rows }
}

describe('消息图片相册布局', () => {
  it('九张横竖混合图片保持原顺序、原比例，行内等高且只留下图片间距', () => {
    const { height, rows } = expectCompleteOrderedGallery(
      [4 / 3, 4 / 3, 4 / 3, 4 / 3, 4 / 3, 3 / 4, 4 / 3, 3 / 4, 4 / 3],
      680,
    )
    expect(rows.some((row) => row.some((tile) => tile.width < tile.height))).toBe(true)
    expect(rows.every((row) => row.length > 1)).toBe(true)
    expect(height).toBeLessThan(600)
  })

  it.each([240, 272, 320, 390, 400, 520, 680])(
    '在 %i px 容器内完整容纳横图、竖图、方图，不发生横向溢出',
    (width) => {
      const { tiles } = expectCompleteOrderedGallery([2, 0.75, 1, 4 / 3, 0.5, 3, 1], width)
      expect(tiles.every((tile) => tile.height <= (width < 400 ? 148 : 196))).toBe(true)
    },
  )

  it.each([
    { ratio: 2, width: 320, height: 160 },
    { ratio: 0.5, width: 320, height: 340 },
    { ratio: 0.5, width: 240, height: 340 },
    { ratio: 1, width: 240, height: 240 },
  ])('单图保持完整比例并限制高度：$ratio / $width px', ({ ratio, width, height }) => {
    const layout = expectCompleteOrderedGallery([ratio], width)
    expect(layout.height).toBe(height)
  })

  it('两张图片不会为了填满整行而放大', () => {
    const { tiles, rows } = expectCompleteOrderedGallery([4 / 3, 3 / 4], 680)
    expect(rows).toHaveLength(1)
    expect(tiles.every((tile) => tile.height <= 156)).toBe(true)
    expect(tiles.at(-1)!.x + tiles.at(-1)!.width).toBeLessThan(680)
  })

  it.each([272, 680])('末行在 %i px 容器下保持克制尺寸', (width) => {
    const { rows } = expectCompleteOrderedGallery([1, 1, 1, 1, 1, 1, 1], width)
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.at(-1)![0]!.height).toBeLessThanOrEqual(width < 400 ? 112 : 156)
  })

  it.each([240, 680])('全景与长截图在 %i px 容器内不裁切、不重叠', (width) => {
    expectCompleteOrderedGallery([20, 0.05, 4 / 3, 0.1, 12, 1], width)
    expectCompleteOrderedGallery([20], width)
    expectCompleteOrderedGallery([0.05], width)
  })

  it('空相册没有占位高度', () => {
    expect(expectCompleteOrderedGallery([], 680)).toEqual({ tiles: [], rows: [], height: 0 })
  })
})
