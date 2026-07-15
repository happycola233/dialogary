import { Check, X } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import {
  ACCENT_OPTIONS,
  FONT_OPTIONS,
  WIDTH_OPTIONS,
  applyAppearance,
  getAppearance,
  type Appearance,
} from '../lib/appearance'
import { useIsDark } from '../lib/useIsDark'
import { useAppStore } from '../model/store'

/** 外观设置：气泡颜色 / 内容宽度 / 消息字号，改动即时生效并持久化 */
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  if (!open) return null
  return <SettingsPanel onClose={() => setOpen(false)} />
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const isDark = useIsDark()
  const [appearance, setAppearance] = useState<Appearance>(getAppearance)

  const update = (patch: Partial<Appearance>) => {
    const next = { ...appearance, ...patch }
    setAppearance(next)
    applyAppearance(next)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-3 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">外观设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={15} />
          </button>
        </div>
        <div className="space-y-5 px-4 py-4">
          <SettingRow label="气泡颜色">
            <div className="flex items-center gap-2">
              {ACCENT_OPTIONS.map((o) => {
                const active = appearance.accent === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    title={o.label}
                    aria-pressed={active}
                    onClick={() => update({ accent: o.value })}
                    className={clsx(
                      'flex h-7 w-7 items-center justify-center rounded-full transition-shadow',
                      active &&
                        'ring-2 ring-neutral-400 ring-offset-2 ring-offset-white dark:ring-neutral-500 dark:ring-offset-neutral-900',
                    )}
                    style={{ backgroundColor: isDark ? o.dark : o.light }}
                  >
                    {active && <Check size={14} className="text-white drop-shadow" />}
                  </button>
                )
              })}
            </div>
          </SettingRow>
          <SettingRow label="内容宽度" hint="聊天正文的最大宽度">
            <Segmented
              options={WIDTH_OPTIONS}
              value={appearance.width}
              onChange={(width) => update({ width })}
            />
          </SettingRow>
          <SettingRow label="消息字号">
            <Segmented
              options={FONT_OPTIONS}
              value={appearance.font}
              onChange={(font) => update({ font })}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1 text-xs transition-colors',
            o.value === value
              ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-600/70 dark:text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
