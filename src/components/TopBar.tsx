import { BarChart3, BookOpen, Download, FolderOpen, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings2 } from 'lucide-react'
import { useRef } from 'react'
import { filesFromInput } from '../data/pickSource'
import clsx from 'clsx'
import { useAppStore } from '../model/store'
import { BrainIcon } from './BrainIcon'
import { FilterSegment } from './FilterSegment'
import { LintBadge } from './LintBadge'
import { ThemeToggle } from './ThemeToggle'

export function TopBar({
  onMenuClick,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  onMenuClick?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}) {
  const doc = useAppStore((s) => s.doc)
  const expandAll = useAppStore((s) => s.expandAllThinking)
  const setExpandAll = useAppStore((s) => s.setExpandAllThinking)
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const setExportOpen = useAppStore((s) => s.setExportOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const openFiles = useAppStore((s) => s.openFiles)
  const openDirectory = useAppStore((s) => s.openDirectory)
  const dirInput = useRef<HTMLInputElement>(null)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200/80 bg-white/85 px-2 backdrop-blur sm:px-3 dark:border-neutral-800 dark:bg-black/85">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
          title="大纲"
        >
          <Menu size={17} />
        </button>
      )}
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:flex dark:text-neutral-400 dark:hover:bg-neutral-800"
          title={sidebarCollapsed ? '展开大纲' : '折叠大纲'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      )}
      <BookOpen size={17} className="ml-1 hidden shrink-0 text-indigo-500 sm:block dark:text-indigo-400" />
      <h1 className="min-w-0 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {doc?.title ?? 'Dialogary'}
      </h1>
      {doc && (
        <span className="hidden text-xs text-neutral-400 sm:block dark:text-neutral-500">
          {doc.messages.length} 条
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <FilterSegment />
        <LintBadge />
        <button
          type="button"
          onClick={() => {
            void openDirectory().then((handled) => {
              if (!handled) dirInput.current?.click()
            })
          }}
          title="打开其他文件夹（也可直接拖入文件）"
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 sm:flex dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <FolderOpen size={16} />
        </button>
        <input
          ref={dirInput}
          type="file"
          // @ts-expect-error 非标准属性，Chromium/WebKit 支持
          webkitdirectory=""
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void openFiles(filesFromInput(e.target.files))
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => setView(view === 'stats' ? 'chat' : 'stats')}
          title={view === 'stats' ? '返回聊天' : '统计'}
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            view === 'stats'
              ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300'
              : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
          )}
        >
          <BarChart3 size={16} />
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          title="导出 Markdown"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <Download size={16} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="搜索（Ctrl+K）"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          onClick={() => setExpandAll(!expandAll)}
          title={expandAll ? '折叠全部思考' : '展开全部思考'}
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            expandAll
              ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300'
              : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
          )}
        >
          <BrainIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="外观设置"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <Settings2 size={16} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
