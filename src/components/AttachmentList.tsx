import { ExternalLink, FileText, FolderOpen, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../model/store'
import type { Attachment } from '../parser/types'
import { ImageGallery } from './ImageGallery'

export function AttachmentList({
  attachments,
  align = 'start',
}: {
  attachments: Attachment[]
  align?: 'start' | 'end'
}) {
  const resolveAsset = useAppStore((state) => state.resolveAsset)
  const openLightbox = useAppStore((state) => state.openLightbox)
  const reconnectImages = useAppStore((state) => state.reconnectImages)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  if (!attachments.length) return null
  const resolve = (attachment: Attachment) =>
    resolveAsset(attachment.path) ??
    (attachment.path && /^(?:https?:)?\/\//i.test(attachment.path) ? attachment.path : null)
  const viewable = attachments.filter(
    (attachment) =>
      attachment.kind === 'image' && resolve(attachment) && !failed.has(resolve(attachment)!),
  )
  // 只合并相邻图片，不改变图片与文件在记录中的原始顺序。
  const groups: Attachment[][] = []
  for (const attachment of attachments) {
    const previous = groups.at(-1)
    if (attachment.kind === 'image' && previous?.[0]?.kind === 'image') previous.push(attachment)
    else groups.push([attachment])
  }

  const unavailable = (attachment: Attachment) => (
    <div
      className={`flex h-full min-h-20 items-center gap-3 rounded-xl bg-neutral-100/70 px-3 py-3 text-xs dark:bg-neutral-900/80 ${attachment.kind === 'image' ? 'justify-center' : ''}`}
    >
      {attachment.kind === 'image' ? (
        <ImageOff size={19} className="shrink-0 text-neutral-400" />
      ) : (
        <FileText size={17} className="shrink-0 text-neutral-400" />
      )}
      <div className="min-w-0">
        <p className="truncate text-neutral-500">
          {attachment.kind === 'image' ? '图片暂不可用' : attachment.name}
        </p>
        {attachment.kind !== 'image' && (
          <p className="mt-0.5 text-[10px] text-neutral-400">附件暂不可用</p>
        )}
      </div>
      {attachment.path && (
        <button
          type="button"
          onClick={() => {
            void reconnectImages()
          }}
          aria-label={`重新关联 ${attachment.name}`}
          title="选择附件所在的文件夹"
          className="shrink-0 rounded-lg p-2 text-[var(--dg-accent)] hover:bg-[var(--dg-accent-soft)]"
        >
          <FolderOpen size={16} />
        </button>
      )}
    </div>
  )

  return (
    <div className={`my-2 flex flex-col gap-2.5 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {groups.map((group, groupIndex) =>
        group[0]?.kind === 'image' ? (
          <ImageGallery
            key={groupIndex}
            attachments={group}
            resolve={(attachment) => {
              const url = resolve(attachment)
              return url && !failed.has(url) ? url : null
            }}
            onOpen={(attachment) => openLightbox(viewable, viewable.indexOf(attachment))}
            onError={(url) => setFailed((previous) => new Set([...previous, url]))}
            unavailable={unavailable}
          />
        ) : (
          group.map((attachment, index) => {
            const url = resolve(attachment)
            return url && !failed.has(url) ? (
              <a
                key={`${attachment.path}:${index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={`打开 ${attachment.name}`}
                className="flex max-w-full items-center gap-2 rounded-xl bg-neutral-100/80 px-3 py-3 text-xs text-neutral-600 transition hover:text-[var(--dg-accent)] dark:bg-neutral-900 dark:text-neutral-300"
              >
                <FileText size={15} className="shrink-0 text-neutral-400" />
                <span className="truncate">{attachment.name}</span>
                <ExternalLink size={11} className="shrink-0 opacity-50" />
              </a>
            ) : (
              <div key={`${attachment.path}:${index}`}>{unavailable(attachment)}</div>
            )
          })
        ),
      )}
    </div>
  )
}
