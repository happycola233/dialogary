import { useMemo, useState } from 'react'
import { Check, Plus, Smile, Star, X } from 'lucide-react'
import { useAppStore } from '../model/store'
import { usedReactions, useReactionFavorites } from '../model/reactions'
import { Popover } from './ui/Popover'

export function ReactionPicker({
  selected = [],
  onSelect,
  className = 'dg-icon !h-7 !w-7',
}: {
  selected?: string[]
  onSelect: (emoji: string) => void
  className?: string
}) {
  const doc = useAppStore((state) => state.doc)
  const used = useMemo(() => usedReactions(doc), [doc])
  const { favorites, toggle, add } = useReactionFavorites()
  const [custom, setCustom] = useState('')
  const [manage, setManage] = useState(false)
  return (
    <Popover
      trigger={
        <button type="button" className={className} aria-label="添加表情">
          <Smile size={15} />
        </button>
      }
      align="end"
      className="dg-menu dg-reaction-picker"
      ariaLabel="选择表情"
    >
      {({ close }) => {
        const choose = (emoji: string) => {
          onSelect(emoji)
          close()
        }
        const addCustom = () => {
          const emoji = custom.trim()
          if (!emoji) return
          add(emoji)
          choose(emoji)
          setCustom('')
        }
        const grid = (items: string[], favorite: boolean) => (
          <div className="dg-reaction-grid">
            {items.map((emoji) => (
              <div key={emoji} className="dg-reaction-option">
                <button
                  type="button"
                  className="dg-emoji-choice"
                  aria-label={`选择表情 ${emoji}`}
                  aria-pressed={selected.includes(emoji)}
                  onClick={() => choose(emoji)}
                >
                  {emoji}
                  {selected.includes(emoji) && <Check size={10} className="dg-emoji-selected" />}
                </button>
                {(!favorite || manage) && (
                  <button
                    type="button"
                    className="dg-emoji-favorite"
                    aria-label={`${favorites.includes(emoji) ? '取消收藏表情' : '收藏表情'} ${emoji}`}
                    onClick={() => toggle(emoji)}
                  >
                    {favorite ? (
                      <X size={11} />
                    ) : (
                      <Star size={11} className={favorites.includes(emoji) ? 'fill-current' : ''} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
        return (
          <>
            <div className="dg-reaction-heading">
              <span>常用表情</span>
              <button
                type="button"
                className="dg-reaction-manage"
                onClick={() => setManage(!manage)}
              >
                {manage ? '完成' : '管理'}
              </button>
            </div>
            <div className="dg-reaction-scroll">
              {favorites.length ? (
                grid(favorites, true)
              ) : (
                <p className="dg-reaction-empty">点星标收藏表情，下次一点就能用。</p>
              )}
              {used.length > 0 && (
                <>
                  <div className="dg-reaction-heading dg-reaction-subheading">
                    <span>日记中用过</span>
                  </div>
                  {grid(used, false)}
                </>
              )}
            </div>
            <div className="dg-reaction-add">
              <input
                aria-label="自定义表情"
                value={custom}
                maxLength={40}
                placeholder="输入或粘贴表情"
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    addCustom()
                  }
                }}
              />
              <button
                type="button"
                disabled={!custom.trim()}
                aria-label="添加并收藏表情"
                title="添加并收藏"
                onClick={addCustom}
              >
                <Plus size={17} />
              </button>
            </div>
          </>
        )
      }}
    </Popover>
  )
}

export function ReactionField({
  values,
  onChange,
}: {
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">表情</span>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl bg-neutral-100/80 px-3 py-2 dark:bg-neutral-800/70">
        {values.map((emoji) => (
          <button
            type="button"
            className="dg-reaction"
            key={emoji}
            aria-label={`移除表情 ${emoji}`}
            onClick={() => onChange(values.filter((item) => item !== emoji))}
          >
            {emoji}
            <X size={10} />
          </button>
        ))}
        <ReactionPicker
          selected={values}
          onSelect={(emoji) =>
            onChange(
              values.includes(emoji) ? values.filter((item) => item !== emoji) : [...values, emoji],
            )
          }
        />
        {!values.length && <span className="text-xs text-neutral-400">用一个表情记住此刻</span>}
      </div>
    </div>
  )
}
