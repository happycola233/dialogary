import { create } from 'zustand'
import type { PersonalFields } from '../parser/types'

const storageKey = 'dialogary:favorite-reactions'

export function uniqueReactions(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function usedReactions(
  document: { sessions: (PersonalFields & { messages: PersonalFields[] })[] } | null,
): string[] {
  const counts = new Map<string, number>()
  for (const day of document?.sessions ?? [])
    for (const item of [day, ...day.messages])
      for (const reaction of uniqueReactions(item.reactions ?? []))
        counts.set(reaction, (counts.get(reaction) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([reaction]) => reaction)
}

function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value)
      ? uniqueReactions(value.filter((item): item is string => typeof item === 'string'))
      : []
  } catch {
    return []
  }
}

export const useReactionFavorites = create<{
  favorites: string[]
  toggle: (emoji: string) => void
  add: (emoji: string) => void
}>((set, get) => {
  const persist = (favorites: string[]) => {
    set({ favorites })
    try {
      localStorage.setItem(storageKey, JSON.stringify(favorites))
    } catch {
      /* 存储不可用时，当前页面仍可管理常用表情。 */
    }
  }
  return {
    favorites: readFavorites(),
    toggle: (emoji) =>
      persist(
        get().favorites.includes(emoji)
          ? get().favorites.filter((item) => item !== emoji)
          : uniqueReactions([...get().favorites, emoji]),
      ),
    add: (emoji) => persist(uniqueReactions([...get().favorites, emoji])),
  }
})
