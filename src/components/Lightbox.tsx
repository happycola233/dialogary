import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../model/store'
import { downloadBlob } from '../data/fileAccess'
import { showToast } from '../lib/toast'

/** 原生顶层灯箱避免被消息的延迟渲染容器裁剪，同时保留键盘焦点与 Esc 关闭。 */
export function Lightbox() {
  const lightbox = useAppStore((state) => state.lightbox)
  const close = useAppStore((state) => state.closeLightbox)
  const step = useAppStore((state) => state.stepLightbox)
  const resolveAsset = useAppStore((state) => state.resolveAsset)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [downloading, setDownloading] = useState(false)
  const active = !!lightbox

  useEffect(() => {
    if (active && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [active])

  if (!lightbox) return null
  const images = lightbox.attachments
  const attachment = images[lightbox.index]!
  const url = resolveAsset(attachment.path) ?? attachment.path
  const download = async () => {
    if (!url) return
    setDownloading(true)
    try {
      const response = await fetch(url)
      if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
        throw new Error('图片暂不可用，请重新关联附件文件夹。')
      downloadBlob(attachment.name, await response.blob())
    } catch (cause) {
      showToast(
        cause instanceof Error && cause.message !== 'Failed to fetch'
          ? cause.message
          : '暂时无法下载，请重新关联附件文件夹后重试。',
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="图片预览"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          step(-1)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          step(1)
        }
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/90 p-0 text-white backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col" onClick={close}>
        <div
          className="flex shrink-0 items-center gap-2 p-3 text-white/80"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 flex-1 truncate px-2 text-sm" title={attachment.name}>
            {attachment.name}
          </span>
          {images.length > 1 && (
            <span className="shrink-0 text-xs tabular-nums text-white/60">
              {lightbox.index + 1} / {images.length}
            </span>
          )}
          <button
            type="button"
            disabled={downloading}
            onClick={() => {
              void download()
            }}
            aria-label={`下载图片 ${attachment.name}`}
            className="ml-2 inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm hover:bg-white/15 disabled:opacity-40"
          >
            <Download size={17} />
            <span className="hidden sm:inline">{downloading ? '下载中…' : '下载'}</span>
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="关闭图片预览"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 pb-6">
          {url && (
            <img
              src={url}
              alt={attachment.name}
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张图片"
                onClick={(event) => {
                  event.stopPropagation()
                  step(-1)
                }}
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 hover:bg-black/60"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                aria-label="下一张图片"
                onClick={(event) => {
                  event.stopPropagation()
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
    </dialog>
  )
}
