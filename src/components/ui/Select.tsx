import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import {
  findSelectTypeaheadMatch,
  readSelectTypeaheadKey,
  resolveSelectOpeningHighlight,
} from './selectKeyboard'
import { placeSelectMenu, type SelectMenuCoords } from './selectMenuPosition'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** 色板选项在按钮和菜单中共用同一色样。 */
  swatch?: string
}

/** 与原生 change 事件同形，现有 `e.target.value` 调用点不用改。 */
export interface SelectChangeEvent {
  target: { value: string }
}

interface Props {
  label?: string
  options: readonly SelectOption[]
  value?: string
  onChange?: (event: SelectChangeEvent) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  'aria-label'?: string
  /** sm=32px 紧凑控件；md=与表单输入框同高。字号、菜单行距随尺寸统一调整。 */
  size?: 'sm' | 'md'
}

const TYPEAHEAD_RESET_MS = 500

function emitChange(onChange: Props['onChange'], value: string) {
  onChange?.({ target: { value } })
}

export function Select({
  label,
  options,
  value = '',
  onChange,
  disabled = false,
  className,
  id,
  name,
  'aria-label': ariaLabel,
  size = 'md',
}: Props) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeaheadRef = useRef({ query: '', timer: 0 })
  const openingHighlightRef = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [coords, setCoords] = useState<SelectMenuCoords | null>(null)

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const displayLabel = selected?.label ?? (value || '请选择')

  const close = () => {
    openingHighlightRef.current = undefined
    setOpen(false)
  }

  const openMenu = (preferredIndex?: number) => {
    openingHighlightRef.current = preferredIndex
    setOpen(true)
  }

  const commit = (next: string) => {
    if (options.find((option) => option.value === next)?.disabled) return
    if (next !== value) emitChange(onChange, next)
    close()
    triggerRef.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    const openingIndex = resolveSelectOpeningHighlight(
      options.length,
      selectedIndex,
      openingHighlightRef.current,
    )
    setHighlightedIndex(
      options[openingIndex]?.disabled
        ? options.findIndex((option) => !option.disabled)
        : openingIndex,
    )
    openingHighlightRef.current = undefined

    // 菜单保留在所属 dialog 的 DOM 内，同时进入顶层，既不被 inert 隔离，也不被圆角裁切。
    const popover = menuRef.current
    popover?.showPopover()

    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const menu = menuRef.current
      const contentHeight = menu?.scrollHeight ?? options.length * 36 + 8
      setCoords(
        placeSelectMenu({
          trigger: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            width: rect.width,
          },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          contentHeight,
          menuWidth: menu ? Math.max(menu.offsetWidth, menu.scrollWidth) : undefined,
        }),
      )
    }

    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    // 祖先滚动会带动触发器，捕获阶段才能收到 overflow 容器里的 scroll。
    window.addEventListener('scroll', update, true)
    return () => {
      if (popover?.isConnected && popover.matches(':popover-open')) popover.hidePopover()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, options.length, selectedIndex])

  useLayoutEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLElement>('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightedIndex])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    // 捕获 Escape，避免管理弹窗（window keydown）把整个 Modal 一起关掉。
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
      triggerRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useEffect(() => {
    const typeahead = typeaheadRef.current
    return () => window.clearTimeout(typeahead.timer)
  }, [])

  const moveHighlight = (delta: number) => {
    if (options.length === 0) return
    setHighlightedIndex((current) => {
      for (let step = 1; step <= options.length; step++) {
        const index = (current + delta * step + options.length) % options.length
        if (!options[index]?.disabled) return index
      }
      return current
    })
  }

  const applyTypeahead = (key: string) => {
    const nextQuery = `${typeaheadRef.current.query}${key}`.toLocaleLowerCase()
    typeaheadRef.current.query = nextQuery
    window.clearTimeout(typeaheadRef.current.timer)
    typeaheadRef.current.timer = window.setTimeout(() => {
      typeaheadRef.current.query = ''
    }, TYPEAHEAD_RESET_MS)
    return findSelectTypeaheadMatch(options, nextQuery)
  }

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'Tab') {
      if (open) close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      setHighlightedIndex(options.findIndex((option) => !option.disabled))
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      setHighlightedIndex(options.findLastIndex((option) => !option.disabled))
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      const option = options[highlightedIndex]
      if (option) commit(option.value)
      return
    }
    if (event.key === ' ' && !open) {
      event.preventDefault()
      openMenu()
      return
    }
    const typeaheadKey = readSelectTypeaheadKey(event)
    if (typeaheadKey) {
      const match = applyTypeahead(typeaheadKey)
      if (!open) {
        openMenu(match)
        return
      }
      if (match >= 0) setHighlightedIndex(match)
    }
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      disabled={disabled}
      role="combobox"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open ? `${listboxId}-opt-${highlightedIndex}` : undefined}
      onClick={() => {
        if (disabled) return
        if (open) close()
        else openMenu()
      }}
      onKeyDown={onTriggerKeyDown}
      className={clsx(
        'flex w-full items-center justify-between gap-2 border text-left outline-none transition select-none',
        'border-neutral-200 bg-white text-neutral-800',
        'hover:border-neutral-400',
        'focus-visible:border-[var(--dg-accent)] focus-visible:ring-2 focus-visible:ring-[var(--dg-accent-soft)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500',
        size === 'md'
          ? 'min-h-9 rounded-lg px-3 text-[13px] leading-4'
          : 'min-h-8 rounded-lg px-2.5 text-xs',
        open && 'border-[var(--dg-accent)] ring-2 ring-[var(--dg-accent-soft)]',
      )}
    >
      {selected?.swatch && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: selected.swatch }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
      <ChevronDown
        aria-hidden="true"
        className={clsx(
          'h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform dark:text-neutral-500',
          open && 'rotate-180 text-[var(--dg-accent)]',
        )}
      />
    </button>
  )

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        popover="manual"
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel ?? label}
        style={
          coords
            ? {
                inset: 'auto',
                margin: 0,
                left: coords.left,
                minWidth: coords.width,
                maxHeight: coords.maxHeight,
                top: coords.top,
                bottom: coords.bottom,
              }
            : {
                inset: 'auto',
                margin: 0,
                visibility: 'hidden',
                left: 0,
                top: 0,
                minWidth: triggerRef.current?.offsetWidth,
              }
        }
        className="hc-pop-in hc-scrollbar fixed z-[80] w-max max-w-[min(22.5rem,calc(100vw-16px))] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_12px_40px_rgb(0_0_0/0.14)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_12px_40px_rgb(0_0_0/0.45)]"
      >
        {options.map((option, index) => {
          const active = option.value === value
          const highlighted = index === highlightedIndex
          return (
            <div
              key={`${option.value}-${index}`}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={active}
              aria-disabled={option.disabled || undefined}
              data-highlighted={highlighted || undefined}
              onMouseEnter={() => {
                if (!option.disabled) setHighlightedIndex(index)
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option.value)}
              className={clsx(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 transition',
                option.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                size === 'md' ? 'min-h-9 text-[13px]' : 'min-h-8 text-xs',
                highlighted && !active && 'bg-neutral-100 dark:bg-white/10',
                active && 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent)]',
              )}
            >
              {option.swatch && (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ background: option.swatch }}
                />
              )}
              <span className="min-w-0 flex-1 break-words">{option.label}</span>
              <span className="inline-flex w-4 shrink-0 justify-center">
                {active && <Check className="h-4 w-4 text-[var(--dg-accent)]" />}
              </span>
            </div>
          )
        })}
      </div>,
      triggerRef.current?.closest('dialog') ?? document.body,
    )

  const hasExplicitWidth = Boolean(className && /\b(?:w-|min-w-|max-w-|flex-1)/.test(className))
  const control = (
    <div
      ref={rootRef}
      className={clsx(
        'inline-grid min-w-0 grid-cols-[minmax(0,1fr)] align-top',
        hasExplicitWidth ? 'max-w-full' : 'max-w-56',
        className,
      )}
    >
      {name && <input type="hidden" name={name} value={value} />}
      {/* 按最长选项撑开，避免选中短文案后触发器收缩导致筛选条跳动。 */}
      {options.map((option, index) => (
        <span
          key={`sizer-${option.value}-${index}`}
          aria-hidden
          className={clsx(
            'invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-nowrap',
            size === 'md' ? 'pl-3 pr-9 text-[13px]' : 'px-2.5 pr-8 text-xs',
          )}
        >
          {option.label}
        </span>
      ))}
      <div className="col-start-1 row-start-1 min-w-0">{trigger}</div>
      {menu}
    </div>
  )

  if (!label) return control

  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      {control}
    </label>
  )
}
