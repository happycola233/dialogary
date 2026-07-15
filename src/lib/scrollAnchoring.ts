/**
 * 手动滚动锚定：让视口顶缘的内容在任何布局变化后保持原位。
 *
 * 背景：懒挂载 + content-visibility 下，消息的估算高度会在滚动途中被真实高度
 * 替换。原生 scroll anchoring 对这种节点级替换不可靠（main 上已显式禁用）；
 * 而「逐元素高度差补偿」在同一帧多处变化时会互相污染——浏览器先把全部变化
 * 排进布局，事后再按元素位置分类"变化发生在视口上方吗"，边界附近的元素会被
 * 其它变化的位移带过线，导致漏补/错补（表现为跳转落地后或快滚时的小幅抽动）。
 *
 * 这里改用与浏览器锚定等价的语义：滚动时记录顶缘锚元素及其视口位置（此时布局
 * 是干净的），任何尺寸变化后量一次锚元素的位移、整体回写 scrollTop。不需要
 * 知道是谁变的、变了多少，天然免疫批量变化。回写发生在绘制前（ResizeObserver
 * 回调与 useLayoutEffect 都在 paint 之前），视觉上无感。
 */
import { useAppStore } from '../model/store'

let scroller: HTMLElement | null = null
let anchor: { el: Element; top: number } | null = null

/** 视口顶缘的锚元素：优先取消息（m*），长空隙处退回日期节（s*） */
function probeAnchor(): Element | null {
  if (!scroller) return null
  const rect = scroller.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  for (const dy of [8, 40, 120]) {
    const el = document.elementFromPoint(x, rect.top + dy)?.closest('main [id^="m"]')
    if (el) return el
  }
  return document.elementFromPoint(x, rect.top + 8)?.closest('main section[id^="s"]') ?? null
}

function captureAnchor(): void {
  const el = probeAnchor()
  anchor = el ? { el, top: el.getBoundingClientRect().top } : null
}

/**
 * 布局可能变化后调用：把顶缘锚元素拉回原位。
 * 跳转动画期间不干预——动画每帧向目标当前位置重新瞄准，自带纠偏。
 */
export function restoreAnchor(): void {
  if (!scroller) return
  if (useAppStore.getState().jumpTarget) return
  if (!anchor || !anchor.el.isConnected) {
    captureAnchor()
    return
  }
  const shift = anchor.el.getBoundingClientRect().top - anchor.top
  if (shift) {
    scroller.scrollTop += shift
    anchor.top = anchor.el.getBoundingClientRect().top
  }
}

/** main 挂载后初始化；scroll 事件在同帧布局变化之前触发，保证锚点是"变化前"的位置 */
export function initScrollAnchoring(el: HTMLElement): () => void {
  scroller = el
  const onScroll = () => captureAnchor()
  el.addEventListener('scroll', onScroll, { passive: true })
  captureAnchor()
  return () => {
    el.removeEventListener('scroll', onScroll)
    scroller = null
    anchor = null
  }
}
