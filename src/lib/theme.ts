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
  const dark = resolveDark(theme)
  document.documentElement.classList.toggle('dark', dark)
  // 系统深色与网页浅色可以不同；原生输入框和滚动条必须跟随网页选择。
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
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
