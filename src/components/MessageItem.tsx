import { Bot, TerminalSquare } from 'lucide-react'
import { memo } from 'react'
import { Markdown } from '../markdown/Markdown'
import { MESSAGE_BODY_TEXT_CLASS, USER_MESSAGE_TEXT_CLASS } from '../markdown/messageStyles'
import type { DerivedMessage } from '../model/derive'
import { AttachmentList } from './AttachmentList'
import { ModelChip, TimeChip } from './Chips'
import { ThinkingCard } from './ThinkingCard'

/** 消息渲染（memo 依赖派生层的不可变性） */
export const MessageItem = memo(function MessageItem({ msg }: { msg: DerivedMessage }) {
  if (msg.role === 'user') return <UserMessage msg={msg} />
  return <AiMessage msg={msg} />
})

function UserMessage({ msg }: { msg: DerivedMessage }) {
  return (
    <div id={msg.id} className="flex scroll-mt-14 flex-col items-end py-2.5">
      <AttachmentList attachments={msg.attachments} align="end" />
      {msg.content && (
        <div className="hc-user-bubble max-w-[85%] rounded-2xl px-4 py-2.5">
          <div className={USER_MESSAGE_TEXT_CLASS}>
            <Markdown text={msg.content} variant="message" />
          </div>
        </div>
      )}
      {msg.time && (
        <div className="mt-1 pr-1">
          <TimeChip time={msg.time} />
        </div>
      )}
    </div>
  )
}

function AiMessage({ msg }: { msg: DerivedMessage }) {
  const Icon = msg.role === 'system' ? TerminalSquare : Bot
  return (
    <div id={msg.id} className="scroll-mt-14 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
        <Icon size={14} />
        {msg.role === 'system' && <span>system</span>}
        {msg.model && <ModelChip model={msg.model} />}
        {msg.time && <TimeChip time={msg.time} />}
      </div>
      {msg.thinking && <ThinkingCard thinking={msg.thinking} />}
      <AttachmentList attachments={msg.attachments} />
      {msg.content && (
        <div className={MESSAGE_BODY_TEXT_CLASS}>
          <Markdown text={msg.content} variant="message" />
        </div>
      )}
    </div>
  )
}
