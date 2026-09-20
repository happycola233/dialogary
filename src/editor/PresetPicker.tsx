import { useId, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Search, Settings2, Star, X } from 'lucide-react'
import { useAppStore } from '../model/store'
import { presetLabels, usedPresets, usePersonalPresets, type PresetKind } from '../model/presets'
import { Popover } from '../components/ui/Popover'
import { EditorDialog, fieldClass, mutedButtonClass, primaryButtonClass } from './EditorDialog'

export function PresetPicker({
  kind,
  selected = [],
  onSelect,
}: {
  kind: PresetKind
  selected?: string[]
  onSelect: (value: string) => void
}) {
  const doc = useAppStore((state) => state.doc)
  const used = useMemo(() => usedPresets(doc, kind), [doc, kind])
  const favorites = usePersonalPresets((state) => state.presets[kind])
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const label = presetLabels[kind]
  const match = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const favoriteItems = favorites.filter(match)
  const usedItems = used.filter((item) => !favorites.includes(item.value) && match(item.value))
  return (
    <>
      <Popover
        trigger={
          <button
            type="button"
            aria-label={`选择常用${label}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--dg-accent)] hover:bg-[var(--dg-accent-soft)]"
          >
            常用
            <ChevronDown size={12} />
          </button>
        }
        align="end"
        className="dg-menu dg-preset-picker"
        ariaLabel={`选择${label}`}
      >
        {({ close }) => {
          const choose = (value: string) => {
            onSelect(value)
            close()
            setQuery('')
          }
          const row = (value: string, count?: number) => (
            <button
              key={value}
              type="button"
              className="dg-preset-choice"
              title={value}
              aria-pressed={selected.includes(value)}
              onClick={() => choose(value)}
            >
              <span className="dg-preset-name flex-1">{value}</span>
              {count !== undefined && (
                <span className="shrink-0 text-[11px] text-neutral-400">{count} 次</span>
              )}
              {selected.includes(value) && <Check size={13} />}
            </button>
          )
          return (
            <>
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-neutral-100/80 px-3 dark:bg-neutral-800">
                <Search size={14} className="shrink-0 text-neutral-400" />
                <input
                  aria-label={`搜索${label}选项`}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
                  placeholder={`搜索或输入${label}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return
                    if (event.key === 'Enter' && query.trim()) {
                      event.preventDefault()
                      choose(query.trim())
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      event.currentTarget
                        .closest('[popover]')
                        ?.querySelector<HTMLButtonElement>('.dg-preset-choice')
                        ?.focus()
                    }
                  }}
                />
              </div>
              <div
                className="dg-preset-scroll hc-scrollbar"
                onKeyDown={(event) => {
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                  const buttons = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('.dg-preset-choice'),
                  ]
                  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? buttons.length - 1
                        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                          buttons.length
                  buttons[next]?.focus()
                  event.preventDefault()
                }}
              >
                {favoriteItems.length > 0 && (
                  <>
                    <p className="dg-preset-group">常用{label}</p>
                    {favoriteItems.map((value) => row(value))}
                  </>
                )}
                {usedItems.length > 0 && (
                  <>
                    <p className="dg-preset-group">日记中用过</p>
                    {usedItems.map(({ value, count }) => row(value, count))}
                  </>
                )}
                {query.trim() &&
                  ![...favorites, ...used.map((item) => item.value)].includes(query.trim()) && (
                    <button
                      type="button"
                      className="dg-preset-choice text-[var(--dg-accent)]"
                      onClick={() => choose(query.trim())}
                    >
                      <Plus size={14} />
                      <span className="dg-preset-name">使用「{query.trim()}」</span>
                    </button>
                  )}
                {!favoriteItems.length && !usedItems.length && !query && (
                  <p className="px-2 py-5 text-center text-xs text-neutral-400">
                    还没有常用{label}，可以先添加一个。
                  </p>
                )}
              </div>
              <button
                type="button"
                className={`${mutedButtonClass} mt-2 w-full !justify-start`}
                onClick={() => {
                  close()
                  setManaging(true)
                }}
              >
                <Settings2 size={14} />
                管理常用{label}
              </button>
            </>
          )
        }}
      </Popover>
      {managing && <PresetManagerDialog initialKind={kind} onClose={() => setManaging(false)} />}
    </>
  )
}

export function PresetSuggestions({
  kind,
  selected,
  onSelect,
  extra = [],
}: {
  kind: PresetKind
  selected: string[]
  onSelect: (value: string) => void
  extra?: string[]
}) {
  const doc = useAppStore((state) => state.doc)
  const favorites = usePersonalPresets((state) => state.presets[kind])
  const values = useMemo(
    () =>
      [...new Set([...favorites, ...usedPresets(doc, kind).map((item) => item.value), ...extra])]
        .filter((value) => !selected.includes(value))
        .slice(0, 5),
    [doc, favorites, kind, selected, extra],
  )
  return (
    <div className="dg-preset-inline">
      {values.map((value) => (
        <button type="button" key={value} title={value} onClick={() => onSelect(value)}>
          {value}
        </button>
      ))}
    </div>
  )
}

export function MoodField({
  value,
  onChange,
  placeholder = '此刻的心情',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="dg-detail-field">
      <div className="dg-detail-field-heading">
        <label htmlFor={id} className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          心情
        </label>
        <PresetPicker kind="mood" selected={value ? [value] : []} onSelect={onChange} />
      </div>
      <div className="relative">
        <input
          id={id}
          aria-label="心情"
          className={`${fieldClass} pr-10`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        {value && (
          <button
            type="button"
            aria-label="清除心情"
            className="absolute inset-y-0 right-2 px-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <PresetSuggestions kind="mood" selected={value ? [value] : []} onSelect={onChange} />
    </div>
  )
}

export function PresetManagerDialog({
  initialKind = 'tags',
  onClose,
}: {
  initialKind?: PresetKind
  onClose: () => void
}) {
  const [kind, setKind] = useState<PresetKind>(initialKind)
  const [custom, setCustom] = useState('')
  const [query, setQuery] = useState('')
  const doc = useAppStore((state) => state.doc)
  const { presets, add, remove, rename, storageError } = usePersonalPresets()
  const used = useMemo(() => usedPresets(doc, kind), [doc, kind])
  const label = presetLabels[kind]
  const match = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  return (
    <EditorDialog
      title="常用预设"
      subtitle="把常用的词留在手边。"
      onClose={onClose}
      footer={
        <button type="button" className={primaryButtonClass} onClick={onClose}>
          完成
        </button>
      }
    >
      <nav
        aria-label="预设类型"
        className="mb-5 flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
      >
        {(Object.keys(presetLabels) as PresetKind[]).map((value) => (
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-sm ${value === kind ? 'bg-white font-medium text-[var(--dg-accent)] shadow-sm dark:bg-neutral-700' : 'text-neutral-500'}`}
            aria-pressed={value === kind}
            key={value}
            onClick={() => {
              setKind(value)
              setQuery('')
              setCustom('')
            }}
          >
            {presetLabels[value]}
          </button>
        ))}
      </nav>
      <div className="mb-4 flex items-center gap-2">
        <input
          aria-label={`新常用${label}`}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className={fieldClass}
          placeholder={`添加常用${label}`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && custom.trim()) {
              event.preventDefault()
              add(kind, custom)
              setCustom('')
            }
          }}
        />
        <button
          type="button"
          aria-label={`添加常用${label}`}
          className={mutedButtonClass}
          disabled={!custom.trim()}
          onClick={() => {
            add(kind, custom)
            setCustom('')
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      <input
        aria-label={`筛选常用${label}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={`${fieldClass} mb-4`}
        placeholder="搜索常用项和日记中的词"
      />
      <section className="space-y-2">
        <h3 className="mb-2 text-xs font-medium text-neutral-500">常用{label}</h3>
        {presets[kind].filter(match).map((value) => (
          <PresetRenameRow
            key={`${kind}:${value}`}
            value={value}
            label={label}
            onRename={(next) => rename(kind, value, next)}
            onRemove={() => remove(kind, value)}
          />
        ))}
        {!presets[kind].filter(match).length && (
          <p className="py-4 text-center text-xs text-neutral-400">
            {query ? '没有匹配的常用项' : `还没有常用${label}`}
          </p>
        )}
      </section>
      {used.filter((item) => match(item.value)).length > 0 && (
        <section className="mt-5 space-y-1">
          <h3 className="mb-2 text-xs font-medium text-neutral-500">日记中用过</h3>
          {used
            .filter((item) => match(item.value))
            .map(({ value, count }) => (
              <div key={value} className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5">
                <span className="dg-preset-name flex-1 text-sm" title={value}>
                  {value}
                </span>
                <span className="text-xs text-neutral-400">{count} 次</span>
                <button
                  type="button"
                  aria-label={`${presets[kind].includes(value) ? '取消常用' : '设为常用'}${label} ${value}`}
                  className={mutedButtonClass}
                  onClick={() =>
                    presets[kind].includes(value) ? remove(kind, value) : add(kind, value)
                  }
                >
                  <Star
                    size={15}
                    className={
                      presets[kind].includes(value) ? 'fill-current text-[var(--dg-accent)]' : ''
                    }
                  />
                </button>
              </div>
            ))}
        </section>
      )}
      <p className="mt-5 text-xs leading-5 text-neutral-400">
        常用项保存在此浏览器。修改常用项不会改动已有记录。
      </p>
      {storageError && (
        <p role="alert" className="mt-2 text-xs text-amber-600">
          浏览器未能保存常用项，刷新后可能需要重新添加。
        </p>
      )}
    </EditorDialog>
  )
}

function PresetRenameRow({
  value,
  label,
  onRename,
  onRemove,
}: {
  value: string
  label: string
  onRename: (value: string) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(value)
  return (
    <div className="flex items-center gap-1">
      <input
        className={fieldClass}
        aria-label={`常用${label} ${value}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && name.trim()) {
            event.preventDefault()
            onRename(name)
          }
        }}
      />
      <button
        type="button"
        disabled={!name.trim() || name.trim() === value}
        className={mutedButtonClass}
        aria-label={`保存常用${label} ${value}`}
        onClick={() => onRename(name)}
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        className={mutedButtonClass}
        aria-label={`移除常用${label} ${value}`}
        onClick={onRemove}
      >
        <X size={15} />
      </button>
    </div>
  )
}
