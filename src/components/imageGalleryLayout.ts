export interface GalleryTile {
  x: number
  y: number
  width: number
  height: number
}

/** 按原始顺序寻找接近目标高度的分行；行高来自宽高比，不裁切图片。 */
export function imageGalleryLayout(ratios: number[], width: number) {
  const gap = 8
  const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0)
  const target = Math.min(156, Math.max(112, width / Math.min(3, totalRatio)))
  const maxHeight = target * 1.25
  // 接近满行时适度铺齐；稀疏的末行保持正常缩略图大小。
  const rowHeight = (fitted: number, last: boolean) =>
    Math.min(fitted, last && fitted > target * 1.25 ? target : maxHeight)
  if (ratios.length === 1) {
    const height = Math.min(width / ratios[0]!, 340)
    return { tiles: [{ x: 0, y: 0, width: height * ratios[0]!, height }], height }
  }

  const costs = Array<number>(ratios.length + 1).fill(Infinity)
  const breaks = Array<number>(ratios.length).fill(0)
  costs[ratios.length] = 0
  for (let start = ratios.length - 1; start >= 0; start--) {
    let sum = 0
    for (let end = start; end < ratios.length; end++) {
      sum += ratios[end]!
      const fitted = (width - gap * (end - start)) / sum
      if (fitted <= 0) break
      const last = end === ratios.length - 1
      const height = rowHeight(fitted, last)
      const unused = Math.max(0, width - (sum * height + gap * (end - start))) / width
      const deviation = Math.log(height / target)
      const cost =
        deviation * deviation + unused * unused * (last ? 0.35 : 3) + 0.08 + costs[end + 1]!
      if (cost < costs[start]!) {
        costs[start] = cost
        breaks[start] = end + 1
      }
      if (fitted < target * 0.55) break
    }
  }

  const tiles: GalleryTile[] = []
  let y = 0
  for (let start = 0; start < ratios.length;) {
    const end = breaks[start]!
    const row = ratios.slice(start, end)
    const height = rowHeight(
      (width - gap * (row.length - 1)) / row.reduce((sum, ratio) => sum + ratio, 0),
      end === ratios.length,
    )
    let x = 0
    for (const ratio of row) {
      tiles.push({ x, y, width: height * ratio, height })
      x += height * ratio + gap
    }
    y += height + gap
    start = end
  }
  return { tiles, height: Math.max(0, y - gap) }
}
