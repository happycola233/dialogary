import { create } from 'zustand'
import type { PersonalFields } from '../parser/types'

export type PresetKind = 'tags' | 'mood' | 'states'
export type Presets = Record<PresetKind, string[]>
export interface UsedPreset {
  value: string
  count: number
}
export const presetLabels: Record<PresetKind, string> = {
  tags: '标签',
  mood: '心情',
  states: '状态',
}
const storageKey = 'dialogary:personal-presets'
const defaults: Presets = {
  tags: [],
  mood: ['平静', '开心', '充实', '低落', '复杂'],
  states: ['专注', '疲惫', '忙碌', '放松'],
}

export function uniquePresets(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

/** 日期和记录都贡献已有选项；同一项重复出现只计一次。 */
export function usedPresets(
  document: { sessions: (PersonalFields & { messages: PersonalFields[] })[] } | null,
  kind: PresetKind,
): UsedPreset[] {
  const counts = new Map<string, number>()
  for (const day of document?.sessions ?? []) {
    for (const item of [day, ...day.messages]) {
      const values = kind === 'mood' ? (item.mood ? [item.mood] : []) : (item[kind] ?? [])
      for (const value of uniquePresets(values)) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN'))
}

export function renamePreset(values: string[], from: string, to: string): string[] {
  return uniquePresets(values.map((value) => (value === from ? to : value)))
}

function readPresets(): Presets {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (!value || typeof value !== 'object') return structuredClone(defaults)
    const data = value as Record<string, unknown>
    return Object.fromEntries(
      (Object.keys(defaults) as PresetKind[]).map((kind) => [
        kind,
        Array.isArray(data[kind])
          ? uniquePresets(
              (data[kind] as unknown[]).filter((item): item is string => typeof item === 'string'),
            )
          : [...defaults[kind]],
      ]),
    ) as Presets
  } catch {
    return structuredClone(defaults)
  }
}

export const usePersonalPresets = create<{
  presets: Presets
  storageError: boolean
  add: (kind: PresetKind, value: string) => void
  remove: (kind: PresetKind, value: string) => void
  rename: (kind: PresetKind, from: string, to: string) => void
}>((set, get) => {
  const save = (kind: PresetKind, values: string[]) => {
    const presets = { ...get().presets, [kind]: values }
    set({ presets })
    try {
      localStorage.setItem(storageKey, JSON.stringify(presets))
      set({ storageError: false })
    } catch {
      set({ storageError: true })
    }
  }
  return {
    presets: readPresets(),
    storageError: false,
    add: (kind, value) => save(kind, uniquePresets([...get().presets[kind], value])),
    remove: (kind, value) =>
      save(
        kind,
        get().presets[kind].filter((item) => item !== value),
      ),
    rename: (kind, from, to) => save(kind, renamePreset(get().presets[kind], from, to)),
  }
})
