import { Check, RotateCcw, X } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import {
  ACCENT_OPTIONS,
  DEFAULT_APPEARANCE,
  FONT_RANGE,
  WIDTH_RANGE,
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
        <div className="divide-y divide-neutral-100 px-5 dark:divide-neutral-800">
          <section className="py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                气泡颜色
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {ACCENT_OPTIONS.find((o) => o.value === appearance.accent)?.label}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
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
                      'flex h-8 w-8 items-center justify-center rounded-full transition-[transform,box-shadow] hover:scale-110',
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
          </section>
          <SliderRow
            label="内容宽度"
            value={appearance.contentWidth}
            min={WIDTH_RANGE.min}
            max={WIDTH_RANGE.max}
            unit="px"
            onChange={(contentWidth) => update({ contentWidth })}
          />
          <SliderRow
            label="消息字号"
            value={appearance.fontSize}
            min={FONT_RANGE.min}
            max={FONT_RANGE.max}
            unit="px"
            onChange={(fontSize) => update({ fontSize })}
          />
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200/80 px-5 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setAppearance(DEFAULT_APPEARANCE)
              applyAppearance(DEFAULT_APPEARANCE)
            }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <RotateCcw size={13} />
            恢复默认
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 dark:bg-indigo-500/80 dark:hover:bg-indigo-500"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <section className="py-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="dg-slider mt-3 w-full"
        aria-label={label}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-neutral-300 dark:text-neutral-600">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </section>
  )
}
