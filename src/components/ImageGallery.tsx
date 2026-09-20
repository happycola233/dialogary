import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Attachment } from '../parser/types'
import { imageGalleryLayout } from './imageGalleryLayout'

export function ImageGallery({
  attachments,
  resolve,
  onOpen,
  onError,
  unavailable,
}: {
  attachments: Attachment[]
  resolve: (attachment: Attachment) => string | null
  onOpen: (attachment: Attachment) => void
  onError: (url: string) => void
  unavailable: (attachment: Attachment) => ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(680)
  const [ratiosByUrl, setRatiosByUrl] = useState<Record<string, number>>({})
  const ratios = attachments.map((attachment) => ratiosByUrl[resolve(attachment) ?? ''] ?? 4 / 3)
  // 明确首选宽度，让只有图片的气泡也能自然收拢；max-width 再适配窄屏。
  const preferredWidth =
    attachments.length === 1
      ? Math.min(320, ratios[0]! * 340)
      : Math.min(680, ratios.reduce((sum, ratio) => sum + ratio, 0) * 156 + 8 * (ratios.length - 1))
  const layout = imageGalleryLayout(ratios, width)

  useLayoutEffect(() => {
    const element = container.current!
    const measure = () => {
      const measuredWidth = element.getBoundingClientRect().width
      // 隐藏的容器没有可用宽度，重新显示后再计算分行。
      if (measuredWidth > 0) setWidth(measuredWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={container}
      className="dg-attachment-gallery"
      data-count={attachments.length}
      style={{ width: preferredWidth, height: layout.height }}
    >
      {attachments.map((attachment, index) => {
        const tile = layout.tiles[index]!
        const url = resolve(attachment)
        const style = { left: tile.x, top: tile.y, width: tile.width, height: tile.height }
        return url ? (
          <button
            key={`${attachment.path}:${index}`}
            type="button"
            className="dg-image-tile"
            style={style}
            aria-label={`查看图片 ${attachment.name}`}
            onClick={() => onOpen(attachment)}
          >
            <img
              src={url}
              alt={attachment.name}
              loading="lazy"
              decoding="async"
              onLoad={(event) => {
                const image = event.currentTarget
                if (!image.naturalWidth || !image.naturalHeight) return
                const ratio = image.naturalWidth / image.naturalHeight
                setRatiosByUrl((previous) =>
                  previous[url] === ratio ? previous : { ...previous, [url]: ratio },
                )
              }}
              onError={() => onError(url)}
            />
          </button>
        ) : (
          <div
            key={`${attachment.path}:${index}`}
            className="dg-image-tile is-unavailable"
            style={style}
          >
            {unavailable(attachment)}
          </div>
        )
      })}
    </div>
  )
}
