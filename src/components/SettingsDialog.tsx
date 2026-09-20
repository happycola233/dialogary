import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ACCENT_OPTIONS,
  PALETTE_OPTIONS,
  DEFAULT_APPEARANCE,
  FONT_RANGE,
  WIDTH_RANGE,
  applyAppearance,
  getAppearance,
} from '../lib/appearance'
import type { AccentColor, Appearance } from '../lib/appearance'
import { applyTheme, getStoredTheme } from '../lib/theme'
import { useIsDark } from '../lib/useIsDark'
import { useAppStore } from '../model/store'
import { EditorDialog, mutedButtonClass, primaryButtonClass } from '../editor/EditorDialog'
import { Select } from './ui/Select'

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  return open ? <SettingsPanel onClose={() => setOpen(false)} /> : null
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const isDark = useIsDark()
  const [appearance, setAppearance] = useState<Appearance>(getAppearance)
  const [mode, setMode] = useState(getStoredTheme)
  const update = (patch: Partial<Appearance>) => {
    const next = { ...appearance, ...patch }
    setAppearance(next)
    applyAppearance(next)
  }
  return (
    <EditorDialog
      title="外观与阅读"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={`${mutedButtonClass} mr-auto`}
            onClick={() => {
              setAppearance(DEFAULT_APPEARANCE)
              applyAppearance(DEFAULT_APPEARANCE)
              setMode('system')
              applyTheme('system')
            }}
          >
            <RotateCcw size={14} />
            恢复默认
          </button>
          <button type="button" className={primaryButtonClass} onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="dg-reading-settings">
        <div className="dg-setting-row">
          <span className="dg-setting-label">显示模式</span>
          <div className="dg-mode-switch" aria-label="显示模式">
            {(
              [
                { value: 'light', label: '浅色', icon: Sun },
                { value: 'dark', label: '深色', icon: Moon },
                { value: 'system', label: '跟随系统', icon: Monitor },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value)
                  applyTheme(value)
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <section>
          <h3 className="dg-setting-label">界面配色</h3>
          <div className="dg-palette-options">
            {PALETTE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={appearance.palette === option.value}
                onClick={() => update({ palette: option.value })}
              >
                <span className="dg-palette-swatch" style={{ background: option.color }}>
                  {appearance.palette === option.value && <Check size={12} />}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
        <div className="dg-setting-row">
          <span className="dg-setting-label">我的消息颜色</span>
          <Select
            aria-label="我的消息颜色"
            className="w-36"
            size="sm"
            value={appearance.accent}
            onChange={(event) => update({ accent: event.target.value as AccentColor })}
            options={ACCENT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              swatch: isDark ? option.dark : option.light,
            }))}
          />
        </div>
        <div className="dg-setting-reading">
          <SliderRow
            label="阅读宽度"
            value={appearance.contentWidth}
            min={WIDTH_RANGE.min}
            max={WIDTH_RANGE.max}
            onChange={(contentWidth) => update({ contentWidth })}
          />
          <div className="dg-width-presets" aria-label="阅读宽度预设">
            {[
              { label: '紧凑', value: 720 },
              { label: '舒展', value: 960 },
              { label: '宽屏', value: 1200 },
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                aria-pressed={appearance.contentWidth === value}
                onClick={() => update({ contentWidth: value })}
              >
                {label}
                <span>{value}</span>
              </button>
            ))}
          </div>
          <SliderRow
            label="文字大小"
            value={appearance.fontSize}
            min={FONT_RANGE.min}
            max={FONT_RANGE.max}
            onChange={(fontSize) => update({ fontSize })}
          />
        </div>
        <section
          className="dg-reading-preview"
          aria-label="阅读预览"
          style={{ fontSize: appearance.fontSize }}
        >
          <p className="dg-preview-caption">阅读预览</p>
          <p className="hc-user-bubble">
            今天有一阵很舒服的风，
            <br />
            想把这一刻记下来。
          </p>
          <p className="dg-preview-reply">那就留在这里，慢慢写。</p>
        </section>
      </div>
    </EditorDialog>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="dg-reading-slider">
      <span className="dg-setting-row">
        <span className="dg-setting-label">{label}</span>
        <output>
          {value}
          <span> px</span>
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={value}
        style={
          {
            '--dg-slider-progress': `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) => onChange(Number(event.target.value))}
        className="dg-slider"
      />
    </label>
  )
}
