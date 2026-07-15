import { FileText, ImageOff } from 'lucide-react'
import { useAppStore } from '../model/store'
import type { Attachment } from '../parser/types'

/**
 * 附件展示：图片用链接目标加载、方括号显示名作 caption（真实数据两者不同）；
 * 无本地文件（纯名形）或解析失败时显示占位 chip。
 */
export function AttachmentList({ attachments, align = 'start' }: { attachments: Attachment[]; align?: 'start' | 'end' }) {
  const resolveAsset = useAppStore((s) => s.resolveAsset)
  const openLightbox = useAppStore((s) => s.openLightbox)
  const sourceKind = useAppStore((s) => s.sourceKind)
  const reconnectImages = useAppStore((s) => s.reconnectImages)
  if (attachments.length === 0) return null

  // 灯箱只在可加载的图片之间切换
  const viewable = attachments.filter((a) => a.kind === 'image' && resolveAsset(a.path))

  return (
    <div className={`my-1.5 flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {attachments.map((att, i) => {
        const url = resolveAsset(att.path)
        if (att.kind === 'image' && url) {
          return (
            <button
              key={i}
              type="button"
              title={att.name}
              onClick={() => openLightbox(viewable, viewable.indexOf(att))}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
            >
              <img
                src={url}
                alt={att.name}
                loading="lazy"
                decoding="async"
                className="block max-h-44 max-w-56 object-cover transition-transform group-hover:scale-[1.02]"
              />
            </button>
          )
        }
        const Icon = att.kind === 'image' ? ImageOff : FileText
        // 恢复的文档拿不到本地文件 → 占位 chip 可点击重新授权文件夹
        const canReconnect = sourceKind === 'restored' && att.path !== null
        return (
          <button
            key={i}
            type="button"
            disabled={!canReconnect}
            onClick={canReconnect ? () => void reconnectImages() : undefined}
            title={canReconnect ? '点击重新授权图片所在文件夹' : att.kind === 'image' ? '图片文件不在本地' : att.name}
            className="inline-flex cursor-default items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-400 enabled:cursor-pointer enabled:hover:border-indigo-300 enabled:hover:text-indigo-500 dark:border-neutral-600 dark:text-neutral-500"
          >
            <Icon size={13} />
            {att.name}
          </button>
        )
      })}
    </div>
  )
}
