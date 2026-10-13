import { FileText, FolderOpen, ImageOff } from 'lucide-react'
import { useMemo } from 'react'
import { formatDateCn } from '../lib/format'
import type { DerivedMessage } from '../model/derive'
import { useAppStore, type AssetResolver } from '../model/store'
import type { Attachment } from '../parser/types'
import { Popover } from './ui/Popover'

const LIST_LIMIT = 50

/**
 * 本地附件解析不到文件即视为缺失；只记名称、没有路径的附件本就不对应文件。
 * 网页数据源的附件按需从服务器加载，不能预先判断，解析器会直接给出地址。
 */
export function missingAttachments(
  messages: DerivedMessage[],
  resolve: AssetResolver,
): { message: DerivedMessage; attachment: Attachment }[] {
  return messages.flatMap((message) =>
    message.attachments
      .filter((attachment) => attachment.path && !resolve(attachment.path))
      .map((attachment) => ({ message, attachment })),
  )
}

/** 顶栏提示：汇总找不到文件的附件，可逐条定位或重新选择附件所在的文件夹。 */
export function AttachmentStatus() {
  const doc = useAppStore((s) => s.doc)
  const resolveAsset = useAppStore((s) => s.resolveAsset)
  const connected = useAppStore((s) => s.assets.size > 0 || !!s.directoryHandle)
  const requestJump = useAppStore((s) => s.requestJump)
  const reconnectImages = useAppStore((s) => s.reconnectImages)
  const missing = useMemo(
    () => (doc ? missingAttachments(doc.messages, resolveAsset) : []),
    [doc, resolveAsset],
  )
  if (!missing.length) return null
  const title = connected ? `${missing.length} 个附件未找到` : `${missing.length} 个附件尚未关联`
  return (
    <Popover
      align="end"
      ariaLabel={title}
      className="dg-menu w-[min(22rem,calc(100vw-2rem))] p-2"
      trigger={
        <button
          type="button"
          aria-label={title}
          data-tooltip={title}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-amber-500 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10"
        >
          <ImageOff size={14} />
          {missing.length}
        </button>
      }
    >
      {({ close }) => (
        <>
          <div className="px-3 pb-2 pt-2">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{title}</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {connected
                ? '这些文件不在已打开的文件夹中，可能被移动、改名或删除。'
                : '打开日记所在的文件夹后，图片与文件即可显示。'}
            </p>
          </div>
          <div className="dg-menu-list hc-scrollbar max-h-72 overflow-y-auto">
            {missing.slice(0, LIST_LIMIT).map(({ message, attachment }, index) => (
              <button
                type="button"
                key={`${message.id}:${index}`}
                onClick={() => {
                  close()
                  requestJump(message.id, { flash: true })
                }}
              >
                {attachment.kind === 'image' ? <ImageOff size={15} /> : <FileText size={15} />}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{attachment.name}</span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {message.effectiveDate ? formatDateCn(message.effectiveDate) : '未标日期'} ·{' '}
                    {attachment.path}
                  </span>
                </span>
              </button>
            ))}
            {missing.length > LIST_LIMIT && (
              <p className="px-3 py-2 text-xs text-neutral-400">
                还有 {missing.length - LIST_LIMIT} 个附件
              </p>
            )}
          </div>
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            type="button"
            onClick={() => {
              close()
              void reconnectImages()
            }}
          >
            <FolderOpen size={15} />
            选择附件所在的文件夹
          </button>
        </>
      )}
    </Popover>
  )
}
