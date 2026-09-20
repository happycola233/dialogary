import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Copy,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import { Fragment, memo } from 'react'
import clsx from 'clsx'
import { Markdown } from '../markdown/Markdown'
import { MESSAGE_BODY_TEXT_CLASS, USER_MESSAGE_TEXT_CLASS } from '../markdown/messageStyles'
import type { DerivedMessage } from '../model/derive'
import { todayString, useAppStore } from '../model/store'
import type { Attachment, MessagePart } from '../parser/types'
import { copyToClipboard } from '../lib/clipboard'
import { AttachmentList } from './AttachmentList'
import { TimeChip } from './Chips'
import { ProcessTrack } from './ProcessTrack'
import { ThinkingCard } from './ThinkingCard'
import { ReactionPicker } from './ReactionPicker'
import { Popover } from './ui/Popover'
import { useMessageBubbleSpacing } from './useMessageBubbleSpacing'

const isProcess = (kind: string) =>
  ['reasoning', 'commentary', 'search', 'open_page', 'find_in_page'].includes(kind) ||
  kind.startsWith('x_')

function MessageContent({ msg }: { msg: DerivedMessage }) {
  const expanded = useAppStore((state) => state.expandAllThinking)
  if (!msg.parts?.length)
    return (
      <>
        {msg.thinking && <ThinkingCard thinking={msg.thinking} />}
        <AttachmentList
          attachments={msg.attachments}
          align={msg.role === 'user' ? 'end' : undefined}
        />
        {msg.content && <Markdown text={msg.content} variant="message" />}
      </>
    )
  const groups: { process?: MessagePart[]; attachments?: Attachment[]; part?: MessagePart }[] = []
  for (const part of msg.parts) {
    if (isProcess(part.kind)) {
      const previous = groups.at(-1)
      if (previous?.process) previous.process.push(part)
      else groups.push({ process: [part] })
    } else if (part.kind === 'attachment') {
      const attachment = part.data as unknown as Attachment
      const previous = groups.at(-1)
      if (previous?.attachments) previous.attachments.push(attachment)
      else groups.push({ attachments: [attachment] })
    } else groups.push({ part })
  }
  const inlineAttachments = msg.parts
    .filter((part) => part.kind === 'attachment')
    .map((part) => part.data as unknown as Attachment)
  const leadingAttachments = msg.attachments.filter(
    (attachment) =>
      !inlineAttachments.some(
        (inline) => inline.path === attachment.path && inline.name === attachment.name,
      ),
  )
  return (
    <>
      <AttachmentList
        attachments={leadingAttachments}
        align={msg.role === 'user' ? 'end' : undefined}
      />
      {groups.map((group, index) => (
        <Fragment key={group.part?.id ?? index}>
          {group.process ? (
            <ProcessTrack parts={group.process} expanded={expanded} />
          ) : group.part?.kind === 'answer' ? (
            <div className="my-2 first:mt-0 last:mb-0">
              <Markdown text={group.part.text ?? ''} variant="message" />
            </div>
          ) : group.attachments ? (
            <AttachmentList
              attachments={group.attachments}
              align={msg.role === 'user' ? 'end' : undefined}
            />
          ) : (
            <details className="my-3 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
              <summary>{group.part?.kind}</summary>
              <pre className="mt-2 whitespace-pre-wrap">
                {group.part?.text || JSON.stringify(group.part?.data, null, 2)}
              </pre>
            </details>
          )}
        </Fragment>
      ))}
    </>
  )
}

export const MessageItem = memo(function MessageItem({
  msg,
  contextual = false,
}: {
  msg: DerivedMessage
  contextual?: boolean
}) {
  const state = useAppStore()
  const tagColors = state.doc?.meta.tag_colors as Record<string, string> | undefined
  const diary = state.readMode === 'diary' && !contextual
  const mine = msg.role === 'user'
  const contentRef = useMessageBubbleSpacing(mine && !diary)
  const select = state.selected.has(msg.id)
  const edit = (tab?: string) => state.setEditor({ id: msg.id, date: msg.effectiveDate ?? '', tab })
  const reaction = (emoji: string) => {
    state.patchMessages(
      [msg.id],
      {
        reactions: msg.reactions?.includes(emoji)
          ? msg.reactions.filter((item) => item !== emoji)
          : [...(msg.reactions ?? []), emoji],
      },
      '表情回应',
    )
  }
  const replies: DerivedMessage[] = []
  if (diary)
    for (const following of state.doc!.messages.slice(msg.index + 1)) {
      if (following.role === 'user' || following.sessionIndex !== msg.sessionIndex) break
      replies.push(following)
    }
  return (
    <article
      className={clsx(
        'dg-message group relative py-5',
        state.selecting && 'dg-message-selectable',
        select && 'dg-selected',
        diary && 'dg-diary-entry',
      )}
      data-message-id={msg.id}
    >
      {state.selecting && (
        <button
          className={clsx(
            'absolute left-0 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border',
            select
              ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-fill)] text-white'
              : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900',
          )}
          onClick={() => state.toggleSelected(msg.id)}
          aria-label={select ? '取消选择这条记录' : '选择这条记录'}
          aria-pressed={select}
        >
          {select && <Check size={14} />}
        </button>
      )}
      <div
        className={clsx(
          'mb-2 flex items-center gap-2 text-[11px] text-neutral-400',
          mine && !diary && 'justify-end',
        )}
      >
        {!mine && (msg.role === 'system' ? <TerminalSquare size={13} /> : <Bot size={13} />)}
        {mine && diary && <span className="text-[var(--dg-accent)]">我的记录</span>}
        {!mine && (
          <span>
            {msg.modelInfo?.name ||
              msg.modelInfo?.id ||
              msg.model ||
              (msg.role === 'system' ? '系统记录' : 'AI')}
          </span>
        )}
        {msg.modelInfo?.reasoningEffort && (
          <span className="opacity-75">{msg.modelInfo.reasoningEffort}</span>
        )}
        {msg.time && <TimeChip time={msg.time} />}
        {msg.starred && <Star size={12} className="fill-amber-400 text-amber-400" />}
      </div>
      <div
        data-message-body
        className={clsx(
          mine && !diary
            ? `hc-user-bubble ml-auto w-fit max-w-[92%] rounded-[22px] px-5 py-2.5 data-[multiline=true]:py-4 ${USER_MESSAGE_TEXT_CLASS}`
            : MESSAGE_BODY_TEXT_CLASS,
        )}
      >
        <div ref={contentRef}>
          <MessageContent msg={msg} />
        </div>
      </div>
      {msg.tags?.length || msg.mood || msg.states?.length ? (
        <div
          className={clsx(
            'mt-3 flex flex-wrap items-center gap-1.5',
            mine && !diary && 'justify-end',
          )}
        >
          {msg.mood && (
            <button className="dg-chip" onClick={() => state.setFilters({ mood: msg.mood! })}>
              {msg.mood}
            </button>
          )}
          {msg.states?.map((item) => (
            <button
              key={item}
              className="dg-chip"
              onClick={() => state.setFilters({ state: item })}
            >
              {item}
            </button>
          ))}
          {msg.tags?.map((tag) => (
            <button
              key={tag}
              className="dg-chip text-[var(--dg-accent)]"
              onClick={() => state.setFilters({ tag })}
            >
              {tagColors?.[tag] && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tagColors[tag] }}
                />
              )}
              #{tag}
            </button>
          ))}
        </div>
      ) : null}
      {msg.annotations?.length ? (
        <details className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          <summary className="w-fit cursor-pointer">{msg.annotations.length} 条批注</summary>
          <div className="mt-3 space-y-3">
            {msg.annotations.map((note) => (
              <div key={note.id} className="dg-annotation">
                <button
                  className="float-right dg-icon !h-6 !w-6"
                  aria-label="编辑批注"
                  onClick={() => edit('annotations')}
                >
                  <Pencil size={12} />
                </button>
                {note.quote && (
                  <blockquote className="mb-2 text-neutral-400">“{note.quote}”</blockquote>
                )}
                <Markdown text={note.text} />
                <p className="mt-1 text-[10px] text-neutral-400">
                  {note.createdAt ? new Date(note.createdAt).toLocaleDateString() : ''}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className={clsx('mt-2 flex items-center gap-0.5', mine && !diary && 'justify-end')}>
        {msg.reactions?.map((emoji) => (
          <button
            key={emoji}
            className="dg-reaction"
            aria-label={`移除表情 ${emoji}`}
            data-tooltip={`移除表情 ${emoji}`}
            onClick={() => reaction(emoji)}
          >
            {emoji}
          </button>
        ))}
        <div className="dg-message-actions flex items-center gap-0.5">
          <button className="dg-icon !h-7 !w-7" aria-label="编辑记录" onClick={() => edit()}>
            <Pencil size={14} />
          </button>
          <button
            className="dg-icon !h-7 !w-7"
            aria-label={msg.starred ? '取消收藏' : '收藏记录'}
            aria-pressed={!!msg.starred}
            onClick={() =>
              state.patchMessages(
                [msg.id],
                { starred: !msg.starred },
                msg.starred ? '取消收藏' : '收藏记录',
              )
            }
          >
            <Star size={14} className={msg.starred ? 'fill-amber-400 text-amber-400' : ''} />
          </button>
          <button
            className="dg-icon !h-7 !w-7"
            aria-label="添加批注"
            onClick={() => edit('annotations')}
          >
            <MessageSquarePlus size={14} />
          </button>
          <ReactionPicker selected={msg.reactions} onSelect={reaction} />
          <Popover
            trigger={
              <button type="button" className="dg-icon !h-7 !w-7" aria-label="记录操作">
                <MoreHorizontal size={16} />
              </button>
            }
            align="end"
            className="dg-menu w-44 p-1.5"
            ariaLabel="记录操作菜单"
          >
            {({ close }) => (
              <>
                <button
                  onClick={() => {
                    void copyToClipboard(msg.content)
                    close()
                  }}
                >
                  <Copy size={14} />
                  复制文字
                </button>
                <button
                  onClick={() => {
                    state.setEditor({ date: msg.effectiveDate ?? todayString(), afterId: msg.id })
                    close()
                  }}
                >
                  <Plus size={14} />
                  在下方插入
                </button>
                <button
                  onClick={() => {
                    close()
                    state.duplicateMessage(msg.id)
                  }}
                >
                  <Copy size={14} />
                  复制这条记录
                </button>
                <button
                  disabled={state.doc?.sessions[msg.sessionIndex]?.messages[0]?.id === msg.id}
                  onClick={() => {
                    state.reorderMessage(msg.id, -1)
                    close()
                  }}
                >
                  <ArrowUp size={14} />
                  在当天上移
                </button>
                <button
                  disabled={state.doc?.sessions[msg.sessionIndex]?.messages.at(-1)?.id === msg.id}
                  onClick={() => {
                    state.reorderMessage(msg.id, 1)
                    close()
                  }}
                >
                  <ArrowDown size={14} />
                  在当天下移
                </button>
                <button
                  onClick={() => {
                    state.setSelected([msg.id])
                    close()
                  }}
                >
                  <Check size={14} />
                  选择与移动
                </button>
                <button
                  onClick={() => {
                    close()
                    if (window.confirm('删除这条记录？之后仍可撤销。'))
                      state.deleteMessages([msg.id])
                  }}
                >
                  <Trash2 size={14} />
                  删除记录
                </button>
              </>
            )}
          </Popover>
        </div>
      </div>
      {diary && replies.length > 0 && (
        <details className="mt-4 text-xs text-neutral-400">
          <summary className="w-fit cursor-pointer">展开 {replies.length} 条 AI 回复</summary>
          <div className="mt-2 pl-3 sm:pl-6">
            {replies.map((reply) => (
              <MessageItem key={reply.id} msg={reply} contextual />
            ))}
          </div>
        </details>
      )}
    </article>
  )
})
