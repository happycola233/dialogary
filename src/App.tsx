import { useEffect, useState } from 'react'
import { lazy, Suspense } from 'react'
import clsx from 'clsx'
import { ChatPane } from './components/ChatPane'
import { ExportDialog } from './components/ExportDialog'
import { Lightbox } from './components/Lightbox'

// recharts 体积不小，统计页按需加载
const StatsView = lazy(() => import('./components/StatsView').then((m) => ({ default: m.StatsView })))
import { SearchDialog } from './components/SearchDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { WelcomeScreen } from './components/WelcomeScreen'
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

  // Ctrl/Cmd+K 打开搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useAppStore.getState().setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 全窗口拖拽打开
  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
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
    <div className="flex h-dvh flex-col bg-white text-neutral-800 dark:bg-black dark:text-neutral-100">
      {load.phase === 'ready' ? (
        <>
          <TopBar
            onMenuClick={() => setSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
          <div className="flex min-h-0 flex-1">
            <aside
              className={clsx(
                'relative hidden shrink-0 overflow-hidden bg-neutral-50 md:block dark:bg-neutral-900',
                !sidebarCollapsed && 'border-r border-neutral-200/80 dark:border-neutral-800',
                // 折叠/展开用宽度过渡动画；拖拽调宽时关掉过渡跟手
                !resizing && 'transition-[width] duration-300 ease-out',
              )}
              style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
            >
              {/* 内容固定为当前侧栏宽度，折叠动画期间不回流 */}
              <div className="h-full" style={{ width: sidebarWidth }}>
                <Sidebar />
              </div>
              {!sidebarCollapsed && (
                <div
                  onPointerDown={startSidebarResize}
                  title="拖拽调整宽度"
                  className="absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-indigo-400/50 active:bg-indigo-400/70"
                />
              )}
            </aside>
            {sidebarOpen && (
              <div className="fixed inset-0 z-40 md:hidden">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setSidebarOpen(false)}
                />
                <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-neutral-50 pt-[env(safe-area-inset-top)] shadow-xl dark:bg-neutral-900">
                  <Sidebar onNavigate={() => setSidebarOpen(false)} />
                </div>
              </div>
            )}
            {/* 普通阅读交给浏览器原生滚动锚定；目录动画期间保持单一 scrollTop 写入者。 */}
            <main
              className="hc-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
              style={{ overflowAnchor: jumping ? 'none' : 'auto' }}
            >
              <ViewSwitch />
            </main>
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
      <SearchDialog />
      <ExportDialog />
      <SettingsDialog />
      <Lightbox />
      <Toasts />
    </div>
  )
}

function ViewSwitch() {
  const view = useAppStore((s) => s.view)
  return (
    <>
      {/* ChatPane 常驻保留滚动位置与已挂载内容，统计视图叠加显示 */}
      <div className={view === 'chat' ? undefined : 'hidden'}>
        <ChatPane />
      </div>
      {view === 'stats' && (
        <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">加载统计…</p>}>
          <StatsView />
        </Suspense>
      )}
    </>
  )
}
