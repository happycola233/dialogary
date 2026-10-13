import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'
import { ChatPane } from './components/ChatPane'
import { ExportDialog } from './components/ExportDialog'
import { Lightbox } from './components/Lightbox'

// recharts 体积不小，统计页按需加载
const StatsView = lazy(() =>
  import('./components/StatsView').then((m) => ({ default: m.StatsView })),
)
import { SearchDialog } from './components/SearchDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { Tooltips } from './components/ui/Tooltips'
import { TopBar } from './components/TopBar'
import { TimelineNav } from './components/TimelineNav'
import { WelcomeScreen } from './components/WelcomeScreen'
import { WorkspacePanels } from './components/WorkspacePanels'
import { ReadingToolbar } from './components/ReadingToolbar'
import { ReviewView } from './components/ReviewView'
import { filesFromDataTransfer } from './data/pickSource'
import { initTheme } from './lib/theme'
import { useAppStore } from './model/store'

const SIDEBAR_MIN = 184
const SIDEBAR_MAX = 420
const SIDEBAR_DEFAULT = 240

export default function App() {
  const load = useAppStore((s) => s.load)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const jumping = useAppStore((s) => s.jumpTarget !== null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('dialogary-sidebar') === 'collapsed',
  )
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem('dialogary-sidebar-width'))
    return Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT
  })
  const [resizing, setResizing] = useState(false)
  const [dragging, setDragging] = useState(false)

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('dialogary-sidebar', next ? 'collapsed' : 'open')
      } catch {
        // 忽略写入失败
      }
      return next
    })
  }

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault()
    setResizing(true)
    const startX = e.clientX
    const startW = sidebarWidth
    let latest = startW
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent) => {
      latest = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX))
      setSidebarWidth(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = prevUserSelect
      setResizing(false)
      try {
        localStorage.setItem('dialogary-sidebar-width', String(latest))
      } catch {
        // 忽略写入失败
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    initTheme()
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const preservePendingDraft = (event: BeforeUnloadEvent) => {
      const state = useAppStore.getState()
      if (state.draftStatus !== 'saved' && state.text !== state.baseline) event.preventDefault()
    }
    window.addEventListener('beforeunload', preservePendingDraft)
    return () => window.removeEventListener('beforeunload', preservePendingDraft)
  }, [])

  // 从其他编辑器切回时核对磁盘，及时载入日记与附件的外部修改。
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void useAppStore.getState().syncWithDisk()
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Ctrl/Cmd+K 打开搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const dialogOpen = Boolean(document.querySelector('dialog[open]'))
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.matches('input, textarea, select') || e.target.isContentEditable)
      if (!dialogOpen && !editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useAppStore.getState().setSearchOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!dialogOpen) useAppStore.getState().setPanel('save-review')
      }
      if (
        !editing &&
        !dialogOpen &&
        (e.ctrlKey || e.metaKey) &&
        ['z', 'y'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault()
        if (e.shiftKey || e.key.toLowerCase() === 'y') useAppStore.getState().redo()
        else useAppStore.getState().undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 全窗口拖拽打开
  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
      if (document.querySelector('dialog[open]')) return
      if (e.dataTransfer?.types.includes('Files')) {
        depth++
        setDragging(true)
      }
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (document.querySelector('dialog[open]')) return
      if (e.dataTransfer) {
        void filesFromDataTransfer(e.dataTransfer).then((files) => {
          if (files.length) void useAppStore.getState().openFiles(files)
        })
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div
      className="dg-app flex h-dvh flex-col bg-white text-neutral-800 dark:bg-black dark:text-neutral-100"
      data-nav-collapsed={sidebarCollapsed}
      data-nav-resizing={resizing}
      style={
        {
          '--dg-nav-width': `${sidebarCollapsed ? 64 : sidebarWidth}px`,
          '--dg-nav-expanded-width': `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      {load.phase === 'ready' ? (
        <>
          <TopBar
            onMenuClick={() => setSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
          <div className="flex min-h-0 flex-1">
            <aside
              aria-label={sidebarCollapsed ? '快捷导航' : '日记导航'}
              className="dg-sidebar dg-desktop-sidebar relative hidden shrink-0 overflow-hidden md:block"
            >
              <Sidebar collapsed={sidebarCollapsed} />
              {!sidebarCollapsed && (
                <div
                  onPointerDown={startSidebarResize}
                  title="拖拽调整宽度"
                  className="dg-sidebar-resize absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize transition-colors"
                />
              )}
            </aside>
            {sidebarOpen && <MobileNavigation onClose={() => setSidebarOpen(false)} />}
            {/* 普通阅读交给浏览器原生滚动锚定；目录动画期间保持单一 scrollTop 写入者。 */}
            <div className="dg-reading-area relative min-w-0 flex-1">
              <main
                className="hc-scrollbar h-full min-h-0 overflow-y-auto overscroll-contain"
                style={{ overflowAnchor: jumping ? 'none' : 'auto' }}
              >
                <ViewSwitch />
              </main>
              <TimelineNav />
            </div>
          </div>
        </>
      ) : load.phase === 'loading' ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-400">加载中…</p>
        </div>
      ) : (
        <WelcomeScreen reason={load.reason} />
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center border-4 border-dashed border-indigo-400/70 bg-indigo-500/10 backdrop-blur-[1px]">
          <p className="rounded-xl bg-white/90 px-5 py-3 text-sm font-medium text-indigo-600 shadow-lg dark:bg-neutral-800/90 dark:text-indigo-300">
            松开以打开 .chat.md 文件或文件夹
          </p>
        </div>
      )}
      <WorkspacePanels />
      <SearchDialog />
      <ExportDialog />
      <SettingsDialog />
      <Lightbox />
      <Toasts />
      <Tooltips />
    </div>
  )
}

function MobileNavigation({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label="日记导航"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX > bounds.right) onClose()
        }
      }}
      className="dg-sidebar fixed inset-y-0 left-0 m-0 flex h-dvh max-h-dvh w-80 max-w-[85vw] flex-col border-0 p-0 pt-[env(safe-area-inset-top)] text-neutral-800 shadow-xl backdrop:bg-black/35 dark:text-neutral-100"
    >
      <div className="flex h-[72px] shrink-0 items-center justify-between px-5">
        <span className="text-lg font-semibold">Dialogary</span>
        <button className="dg-icon" aria-label="关闭导航" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Sidebar onNavigate={onClose} />
      </div>
    </dialog>
  )
}

function ViewSwitch() {
  const view = useAppStore((s) => s.view)
  const positions = useRef<Record<string, number>>({})
  useLayoutEffect(() => {
    const scroller = document.querySelector('main')!
    scroller.scrollTop = positions.current[view] ?? 0
    // 视图隐藏后浏览器会立即压缩 scrollTop，不能等 effect cleanup 再读取旧视图位置。
    const remember = () => {
      positions.current[view] = scroller.scrollTop
    }
    scroller.addEventListener('scroll', remember, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', remember)
    }
  }, [view])
  return (
    <>
      {/* ChatPane 常驻保留滚动位置与已挂载内容，统计视图叠加显示 */}
      <div className={view === 'chat' ? undefined : 'hidden'}>
        <ReadingToolbar />
        <ChatPane />
      </div>
      {view === 'review' && <ReviewView />}
      {view === 'stats' && (
        <Suspense
          fallback={<p className="py-16 text-center text-sm text-neutral-400">加载统计…</p>}
        >
          <StatsView />
        </Suspense>
      )}
    </>
  )
}
