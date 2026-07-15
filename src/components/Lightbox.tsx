import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'
import { useAppStore } from '../model/store'

/** 图片灯箱：全屏遮罩、左右切换、Esc/点击背景关闭 */
export function Lightbox() {
  const lightbox = useAppStore((s) => s.lightbox)
  const close = useAppStore((s) => s.closeLightbox)
  const step = useAppStore((s) => s.stepLightbox)
  const resolveAsset = useAppStore((s) => s.resolveAsset)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, close, step])

  if (!lightbox) return null
  const images = lightbox.attachments
  const att = images[lightbox.index]
  const url = att ? resolveAsset(att.path) : null
  if (!att || !url) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={close}>
      <div className="flex items-center justify-between p-3 text-white/80">
        <span className="min-w-0 truncate px-2 text-sm">{att.name}</span>
        <span className="flex items-center gap-3">
          {images.length > 1 && (
            <span className="text-xs tabular-nums text-white/60">
              {lightbox.index + 1} / {images.length}
            </span>
          )}
          <button type="button" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15">
            <X size={18} />
          </button>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 pb-6">
        <img
          src={url}
          alt={att.name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                step(-1)
              }}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 hover:bg-black/60"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                step(1)
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 hover:bg-black/60"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
