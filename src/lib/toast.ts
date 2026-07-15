export const TOAST_EVENT = 'app-toast'

export interface ToastDetail {
  message: string
}

/** 极简 toast：向 window 派发 CustomEvent，由上层监听渲染。 */
export function showToast(message: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message } }))
}
