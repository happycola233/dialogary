import { useAppStore } from '../model/store'

/** 消息在主滚动视口上下各提前两个视口开始渲染。 */
const LAZY_OVERSCAN_VIEWPORTS = 2

interface LazyObserverPool {
  root: HTMLElement
  callbacks: Map<Element, () => void>
  observer: IntersectionObserver
  rootResizeObserver: ResizeObserver | null
  rootHeight: number
  observerGeneration: number
}

/** 每个滚动容器独立持有 observer，避免模块级单例黏住已经卸载的 root。 */
const lazyObserverPools = new WeakMap<HTMLElement, LazyObserverPool>()
const activeLazyObserverPools = new Set<LazyObserverPool>()
let lazyObservationPaused = false

function measuredRootHeight(root: HTMLElement): number {
  return Math.max(1, Math.round(root.clientHeight))
}

function createIntersectionObserver(pool: LazyObserverPool): IntersectionObserver {
  const overscan = pool.rootHeight * LAZY_OVERSCAN_VIEWPORTS
  const generation = ++pool.observerGeneration
  const observer = new IntersectionObserver(
    (entries) => {
      // disconnect() 之前已经排队的记录仍可能送达；导航态及旧代记录必须忽略。
      if (lazyObservationPaused || generation !== pool.observerGeneration || observer !== pool.observer) return
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const callback = pool.callbacks.get(entry.target)
        if (!callback) continue
        pool.callbacks.delete(entry.target)
        observer.unobserve(entry.target)
        callback()
      }
      if (pool.callbacks.size === 0) disposeLazyObserverPool(pool)
    },
    {
      root: pool.root,
      // IntersectionObserver 的百分比 margin 按 root 宽度解析，不能用 200% 表示两屏高。
      rootMargin: `${overscan}px 0px`,
    },
  )
  return observer
}

function disposeLazyObserverPool(pool: LazyObserverPool): void {
  pool.observerGeneration += 1
  pool.observer.disconnect()
  pool.rootResizeObserver?.disconnect()
  activeLazyObserverPools.delete(pool)
  if (lazyObserverPools.get(pool.root) === pool) lazyObserverPools.delete(pool.root)
}

function rebuildIntersectionObserver(pool: LazyObserverPool): void {
  pool.observer.disconnect()
  pool.observer = createIntersectionObserver(pool)
  if (!lazyObservationPaused) {
    for (const target of pool.callbacks.keys()) pool.observer.observe(target)
  }
}

/**
 * 远距离目录动画只允许 jump controller 写滚动位置；沿途占位符不应被短暂经过的
 * 视口批量触发。落地后重建 observer，只渲染最终两屏预取区。
 */
export function setLazyMessageObservationPaused(paused: boolean): void {
  if (paused === lazyObservationPaused) return
  lazyObservationPaused = paused
  for (const pool of activeLazyObserverPools) {
    if (paused) pool.observer.disconnect()
    else rebuildIntersectionObserver(pool)
  }
}

function getLazyObserverPool(root: HTMLElement): LazyObserverPool {
  const existing = lazyObserverPools.get(root)
  if (existing) return existing

  const pool: LazyObserverPool = {
    root,
    callbacks: new Map<Element, () => void>(),
    observer: null as unknown as IntersectionObserver,
    rootResizeObserver: null,
    rootHeight: measuredRootHeight(root),
    observerGeneration: 0,
  }
  pool.observer = createIntersectionObserver(pool)
  if (typeof ResizeObserver !== 'undefined') {
    pool.rootResizeObserver = new ResizeObserver(() => {
      const nextHeight = measuredRootHeight(root)
      if (nextHeight === pool.rootHeight || pool.callbacks.size === 0) return
      pool.rootHeight = nextHeight
      rebuildIntersectionObserver(pool)
    })
    pool.rootResizeObserver.observe(root)
  }
  lazyObserverPools.set(root, pool)
  activeLazyObserverPools.add(pool)
  return pool
}

export function observeLazyMessageVisibility(
  root: HTMLElement,
  element: Element,
  onVisible: () => void,
): () => void {
  const pool = getLazyObserverPool(root)
  pool.callbacks.set(element, onVisible)
  if (!lazyObservationPaused) pool.observer.observe(element)
  return () => {
    pool.callbacks.delete(element)
    pool.observer.unobserve(element)
    if (pool.callbacks.size === 0) disposeLazyObserverPool(pool)
  }
}

export const hasNativeScrollAnchoring =
  typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto')

interface LegacySizeObservation {
  root: HTMLElement
  height: number
  contentBottom: number
}

let legacySizeObserver: ResizeObserver | null = null
const legacySizeObservations = new Map<Element, LegacySizeObservation>()

function contentBottom(root: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().bottom - root.getBoundingClientRect().top + root.scrollTop
}

/** 旧 Safari 只补偿变化前完整位于视口上方的尺寸差；导航态始终由 jump controller 接管。 */
export function resolveLegacyHeightAdjustment(
  previousHeight: number,
  nextHeight: number,
  previousContentBottom: number,
  scrollTop: number,
  navigating: boolean,
): number {
  const delta = nextHeight - previousHeight
  if (navigating || Math.abs(delta) < 0.5 || previousContentBottom > scrollTop + 0.5) return 0
  return delta
}

/**
 * Safari 27 以前没有原生 scroll anchoring。降级实现不监听 scroll，也不保存滚动锚点；
 * 它只把“完整位于视口上方”的已测消息高度差按一批汇总，因此自身写入不会形成反馈环。
 */
export function observeLegacyMessageSize(
  element: HTMLElement,
  root: HTMLElement,
  initialHeight: number,
): () => void {
  legacySizeObserver ??= new ResizeObserver((entries) => {
    const adjustments = new Map<HTMLElement, number>()
    const navigating = useAppStore.getState().jumpTarget !== null
    for (const entry of entries) {
      const observation = legacySizeObservations.get(entry.target)
      if (!observation) continue
      // 旧 WebKit 对 skipped content 的 borderBoxSize 可能仍返回 intrinsic fallback；rect 才是布局终值。
      const height = (entry.target as HTMLElement).getBoundingClientRect().height
      const adjustment = resolveLegacyHeightAdjustment(
        observation.height,
        height,
        observation.contentBottom,
        observation.root.scrollTop,
        navigating,
      )
      if (adjustment) {
        adjustments.set(observation.root, (adjustments.get(observation.root) ?? 0) + adjustment)
      }
      observation.height = height
      observation.contentBottom = contentBottom(observation.root, entry.target as HTMLElement)
    }
    for (const [root, delta] of adjustments) root.scrollTop += delta

    // 一条消息变高也会推移其后的消息，但后者自身尺寸没变，不会收到 ResizeObserver 记录。
    // 每批结束后统一重基线，避免后续异步图片/Markdown 更新拿过期坐标判断“是否在视口上方”。
    for (const [element, observation] of legacySizeObservations) {
      if (element.isConnected && observation.root.contains(element)) {
        observation.contentBottom = contentBottom(observation.root, element as HTMLElement)
      }
    }
  })
  legacySizeObservations.set(element, {
    root,
    height: initialHeight,
    contentBottom: contentBottom(root, element),
  })
  legacySizeObserver.observe(element, { box: 'border-box' })
  return () => {
    legacySizeObservations.delete(element)
    legacySizeObserver?.unobserve(element)
    if (legacySizeObservations.size === 0) {
      legacySizeObserver?.disconnect()
      legacySizeObserver = null
    }
  }
}
