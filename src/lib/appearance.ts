/**
 * 外观偏好：气泡重点色 / 正文内容宽度 / 消息字号。
 * 气泡色沿用 happychat 管线（<html> 类 → CSS 变量）；宽度与字号为连续数值，
 * 直接写内联 CSS 变量（--dg-content-width / --hc-msg-font）。
 * main.tsx 在渲染前调用 initAppearance()，避免首屏样式跳动。
 */
export type AccentColor = 'default' | 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple'
export type Palette = 'sky' | 'lavender' | 'rose' | 'sand' | 'slate'
export const PALETTE_OPTIONS: {
  value: Palette
  label: string
  color: string
}[] = [
  { value: 'sky', label: '晴空蓝', color: '#dcebf7' },
  { value: 'lavender', label: '雾紫', color: '#e8e3f4' },
  { value: 'rose', label: '浅樱', color: '#f3e1e6' },
  { value: 'sand', label: '暖沙', color: '#efe7d8' },
  { value: 'slate', label: '云灰', color: '#e4e8ed' },
]

export interface Appearance {
  palette: Palette
  accent: AccentColor
  /** 正文最大宽度，px */
  contentWidth: number
  /** 消息字号，px */
  fontSize: number
}

const STORAGE_KEY = 'dialogary-appearance'

export const WIDTH_RANGE = { min: 560, max: 1280, default: 960 }
export const FONT_RANGE = { min: 13, max: 18, default: 15 }

export const DEFAULT_APPEARANCE: Appearance = {
  palette: 'sky',
  accent: 'default',
  contentWidth: WIDTH_RANGE.default,
  fontSize: FONT_RANGE.default,
}

/** 色板 swatch 色值与 happychat 的 ACCENT_OPTIONS 一致 */
export const ACCENT_OPTIONS: {
  value: AccentColor
  label: string
  light: string
  dark: string
}[] = [
  { value: 'default', label: '默认', light: '#b4b4b4', dark: '#9b9b9b' },
  { value: 'blue', label: '蓝色', light: '#3a83f7', dark: '#2c67c5' },
  { value: 'green', label: '绿色', light: '#53b559', dark: '#48a04c' },
  { value: 'yellow', label: '黄色', light: '#f6c543', dark: '#d9a337' },
  { value: 'pink', label: '粉色', light: '#e0766d', dark: '#c96257' },
  { value: 'orange', label: '橙色', light: '#ee7c37', dark: '#d25e28' },
  { value: 'purple', label: '紫色', light: '#8952ee', dark: '#7849d1' },
]

const ACCENTS = new Set(ACCENT_OPTIONS.map((o) => o.value))

// 旧版本的档位制取值 → 数值迁移
const LEGACY_WIDTH: Record<string, number> = {
  narrow: 672,
  standard: 768,
  wide: 960,
}
const LEGACY_FONT: Record<string, number> = {
  small: 14,
  medium: 15,
  large: 17,
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function numberOf(
  value: unknown,
  legacy: Record<string, number>,
  range: { min: number; max: number; default: number },
): number {
  if (typeof value === 'number' && Number.isFinite(value))
    return clamp(Math.round(value), range.min, range.max)
  if (typeof value === 'string' && legacy[value] !== undefined) return legacy[value]!
  return range.default
}

export function getAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const p = JSON.parse(raw) as Partial<
      Record<'palette' | 'accent' | 'width' | 'font' | 'contentWidth' | 'fontSize', unknown>
    >
    return {
      palette: PALETTE_OPTIONS.some((option) => option.value === p.palette)
        ? (p.palette as Palette)
        : 'sky',
      accent: ACCENTS.has(p.accent as AccentColor)
        ? (p.accent as AccentColor)
        : DEFAULT_APPEARANCE.accent,
      contentWidth: numberOf(p.contentWidth ?? p.width, LEGACY_WIDTH, WIDTH_RANGE),
      fontSize: numberOf(p.fontSize ?? p.font, LEGACY_FONT, FONT_RANGE),
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

function applyDom(a: Appearance): void {
  const el = document.documentElement
  el.dataset.palette = a.palette
  for (const o of ACCENT_OPTIONS) el.classList.remove(`hc-accent-${o.value}`)
  if (a.accent !== 'default') el.classList.add(`hc-accent-${a.accent}`)
  // 旧版本的档位类清理（升级用户可能残留）
  el.classList.remove('dg-width-narrow', 'dg-width-wide', 'hc-font-small', 'hc-font-large')
  el.style.setProperty('--dg-content-width', `${a.contentWidth}px`)
  el.style.setProperty('--hc-msg-font', `${a.fontSize}px`)
}

/** 持久化并立即应用 */
export function applyAppearance(a: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
  } catch {
    // 写入失败时本次会话内仍生效
  }
  applyDom(a)
}

/** 启动时应用已存偏好（渲染前调用） */
export function initAppearance(): void {
  applyDom(getAppearance())
}
