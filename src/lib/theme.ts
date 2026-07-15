export type ThemePreference = 'light' | 'dark' | 'system'

// index.html 的防闪烁内联脚本读取同一 key，语义须保持一致：
// 'dark' → 深色；缺失或 'system' → 跟随系统；'light' → 浅色。
const STORAGE_KEY = 'dialogary-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveDark(theme: ThemePreference): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark())
}

function applyDomTheme(theme: ThemePreference): void {
  // color-scheme 由 index.css 的 html.dark 规则随 .dark 类切换。
  document.documentElement.classList.toggle('dark', resolveDark(theme))
}

/** 读取持久化的主题偏好；缺失或非法值一律视为 'system'。 */
export function getStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // localStorage 不可用时按 system 处理。
  }
  return 'system'
}

/** 持久化主题偏好并切换 <html> 的 .dark 类。 */
export function applyTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 忽略写入失败，本次会话内仍生效。
  }
  applyDomTheme(theme)
}

/** 启动时应用已存偏好，并在 'system' 模式下跟随系统主题变化。 */
export function initTheme(): void {
  applyDomTheme(getStoredTheme())
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyDomTheme('system')
  })
}
