import { useEffect, useState } from 'react'
import { TOAST_EVENT } from '../lib/toast'

interface ToastItem {
  id: number
  message: string
}

let nextId = 1

/** 监听 lib/toast 的 CustomEvent，渲染右下角轻提示 */
export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const message = String((e as CustomEvent<{ message?: unknown }>).detail?.message ?? '')
      if (!message) return
      const item = { id: nextId++, message }
      setItems((prev) => [...prev, item])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), 2400)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="rounded-full bg-neutral-800/90 px-4 py-1.5 text-xs text-white shadow-lg backdrop-blur dark:bg-neutral-700/90"
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
