import { Moon, Sun, SunMoon } from 'lucide-react'
import { useState } from 'react'
import { applyTheme, getStoredTheme, type ThemePreference } from '../lib/theme'

const ORDER: ThemePreference[] = ['light', 'dark', 'system']
const LABEL: Record<ThemePreference, string> = { light: '浅色', dark: '深色', system: '跟随系统' }

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(getStoredTheme)
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : SunMoon
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setPref(next)
      }}
      title={`主题：${LABEL[pref]}（点击切换为${LABEL[next]}）`}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
    >
      <Icon size={16} />
    </button>
  )
}
