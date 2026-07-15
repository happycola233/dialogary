/**
 * 外观偏好：气泡重点色 / 正文内容宽度 / 消息字号。
 * 与 happychat 相同的应用管线：偏好 → <html> 上的类 → index.css 里的 CSS 变量。
 * main.tsx 在渲染前调用 initAppearance()，避免首屏样式跳动。
 */
export type AccentColor = 'default' | 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple'
export type ContentWidth = 'narrow' | 'standard' | 'wide'
export type MessageFont = 'small' | 'medium' | 'large'

export interface Appearance {
  accent: AccentColor
  width: ContentWidth
  font: MessageFont
}

const STORAGE_KEY = 'dialogary-appearance'

export const DEFAULT_APPEARANCE: Appearance = { accent: 'default', width: 'standard', font: 'medium' }

/** 色板 swatch 色值与 happychat 的 ACCENT_OPTIONS 一致 */
export const ACCENT_OPTIONS: { value: AccentColor; label: string; light: string; dark: string }[] = [
  { value: 'default', label: '默认', light: '#b4b4b4', dark: '#9b9b9b' },
  { value: 'blue', label: '蓝色', light: '#3a83f7', dark: '#2c67c5' },
  { value: 'green', label: '绿色', light: '#53b559', dark: '#48a04c' },
  { value: 'yellow', label: '黄色', light: '#f6c543', dark: '#d9a337' },
  { value: 'pink', label: '粉色', light: '#e0766d', dark: '#c96257' },
  { value: 'orange', label: '橙色', light: '#ee7c37', dark: '#d25e28' },
  { value: 'purple', label: '紫色', light: '#8952ee', dark: '#7849d1' },
]

export const WIDTH_OPTIONS: { value: ContentWidth; label: string }[] = [
  { value: 'narrow', label: '窄' },
  { value: 'standard', label: '适中' },
  { value: 'wide', label: '宽' },
]

export const FONT_OPTIONS: { value: MessageFont; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

const ACCENTS = new Set(ACCENT_OPTIONS.map((o) => o.value))
const WIDTHS = new Set(WIDTH_OPTIONS.map((o) => o.value))
const FONTS = new Set(FONT_OPTIONS.map((o) => o.value))

export function getAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed: unknown = JSON.parse(raw)
    const p = parsed as Partial<Record<keyof Appearance, unknown>>
    return {
      accent: ACCENTS.has(p.accent as AccentColor) ? (p.accent as AccentColor) : DEFAULT_APPEARANCE.accent,
      width: WIDTHS.has(p.width as ContentWidth) ? (p.width as ContentWidth) : DEFAULT_APPEARANCE.width,
      font: FONTS.has(p.font as MessageFont) ? (p.font as MessageFont) : DEFAULT_APPEARANCE.font,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

function applyDom(a: Appearance): void {
  const el = document.documentElement
  // 默认档不加类（:root 已定义默认变量），非默认档加对应类
  for (const o of ACCENT_OPTIONS) el.classList.remove(`hc-accent-${o.value}`)
  if (a.accent !== 'default') el.classList.add(`hc-accent-${a.accent}`)
  for (const o of WIDTH_OPTIONS) el.classList.remove(`dg-width-${o.value}`)
  if (a.width !== 'standard') el.classList.add(`dg-width-${a.width}`)
  for (const o of FONT_OPTIONS) el.classList.remove(`hc-font-${o.value}`)
  if (a.font !== 'medium') el.classList.add(`hc-font-${a.font}`)
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
