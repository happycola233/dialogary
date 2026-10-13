import {
  Check,
  BookOpen,
  ChevronDown,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  History,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Undo2,
} from 'lucide-react'
import { useRef } from 'react'
import { filesFromInput } from '../data/pickSource'
import { todayString, useAppStore } from '../model/store'
import { AttachmentStatus } from './AttachmentStatus'
import { LintBadge } from './LintBadge'
import { HistoryControls } from './HistoryControls'
import { ThemeToggle } from './ThemeToggle'
import { Popover } from './ui/Popover'

export function TopBar({
  onMenuClick,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  onMenuClick?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}) {
  const state = useAppStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const dirty = state.text !== state.baseline
  const status =
    state.draftStatus === 'error'
      ? '草稿未保存'
      : state.draftStatus === 'saving'
        ? '正在保存草稿…'
        : dirty
          ? state.fileHandle
            ? '草稿已保存 · 待写回文件'
            : '草稿已保存 · 未连接原文件'
          : state.fileHandle
            ? '已与文件同步'
            : '未连接原文件'
  const saveLabel = state.fileHandle ? '保存文件' : '保存副本'
  return (
    <header className="dg-topbar flex h-[72px] shrink-0 items-center gap-1 pr-3 sm:gap-2 sm:pr-5">
      <div className="dg-brand-area flex h-full shrink-0 items-center gap-2 px-3 md:px-4">
        <button className="dg-icon md:hidden" aria-label="打开导航" onClick={onMenuClick}>
          <Menu size={19} />
        </button>
        <BookOpen
          className="dg-brand-mark dg-accent hidden shrink-0 md:block"
          size={21}
          strokeWidth={1.7}
        />
        <span className="dg-brand-name text-[17px] font-semibold tracking-tight">Dialogary</span>
        <button
          className="dg-brand-toggle dg-icon hidden md:inline-flex"
          aria-label={sidebarCollapsed ? '展开导航' : '收起导航'}
          title={sidebarCollapsed ? '展开导航' : '收起导航'}
          aria-expanded={!sidebarCollapsed}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <div className="min-w-0 flex-1 sm:pl-2 md:pl-5">
        <h1 className="truncate text-sm font-semibold tracking-wide">
          <button
            className="hidden max-w-full truncate text-left sm:block"
            title="日记设置"
            onClick={() => state.setPanel('document')}
          >
            {state.doc?.title}
          </button>
        </h1>
        <p
          role="status"
          className={`mt-1 hidden truncate text-[11px] md:block ${state.draftStatus === 'error' ? 'text-red-500' : 'text-neutral-400'}`}
        >
          {status}
        </p>
      </div>
      <HistoryControls />
      <LintBadge />
      <AttachmentStatus />
      <button
        className="dg-icon"
        aria-label="搜索记录"
        title="搜索（Ctrl+K）"
        onClick={() => state.setSearchOpen(true)}
      >
        <Search size={18} />
      </button>
      <button
        className="dg-save"
        onClick={() => state.setPanel('save-review')}
        disabled={state.fileStatus === 'saving'}
        aria-label={saveLabel}
        title={
          state.fileHandle
            ? '写回已连接的文件（Ctrl+S）'
            : '选择位置保存副本；直接写回请先打开本地文件（Ctrl+S）'
        }
      >
        <Save size={16} />
        <span className="hidden sm:inline">
          {state.fileStatus === 'saving' ? '保存中' : saveLabel}
        </span>
      </button>
      <button
        className="dg-primary !px-3 sm:!px-4"
        aria-label="写一段"
        title="写一段记录"
        onClick={() => state.setEditor({ date: todayString() })}
      >
        <PenLine size={16} />
        <span className="hidden sm:inline">写一段</span>
      </button>
      <Popover
        align="end"
        ariaLabel="更多操作菜单"
        className="dg-menu w-60 p-2"
        trigger={
          <button className="dg-icon" aria-label="更多操作">
            <ChevronDown size={17} />
          </button>
        }
      >
        {({ close }) => {
          const action = (callback: () => void) => {
            close()
            callback()
          }
          return (
            <>
              <button
                className="sm:hidden"
                disabled={!state.past.length}
                onClick={() => action(state.undo)}
              >
                <Undo2 size={16} />
                撤销上一步
              </button>
              <button
                className="sm:hidden"
                disabled={!state.future.length}
                onClick={() => action(state.redo)}
              >
                <Redo2 size={16} />
                重做上一步
              </button>
              <button onClick={() => action(state.newDocument)}>
                <FilePlus2 size={16} />
                新建日记
              </button>
              <button
                onClick={() =>
                  action(() => {
                    void state.openFile().then((handled) => {
                      if (!handled) fileInput.current?.click()
                    })
                  })
                }
              >
                <FolderOpen size={16} />
                打开文件
              </button>
              <button
                onClick={() =>
                  action(() => {
                    void state.openDirectory().then((handled) => {
                      if (!handled) dirInput.current?.click()
                    })
                  })
                }
              >
                <FolderOpen size={16} />
                打开文件夹
              </button>
              {(state.fileHandle || state.sourceKind === 'server') && (
                <button onClick={() => action(() => void state.syncWithDisk(true))}>
                  <RefreshCw size={16} />
                  重新载入文件
                </button>
              )}
              <button onClick={() => action(() => state.setPanel('documents'))}>
                <History size={16} />
                最近打开的日记
              </button>
              {state.fileHandle && (
                <button onClick={() => action(() => state.setPanel('save-copy-review'))}>
                  <Save size={16} />
                  另存副本
                </button>
              )}
              <button onClick={() => action(() => state.setPanel('export'))}>
                <Download size={16} />
                导出与归档
              </button>
              <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
              <button onClick={() => action(() => state.setPanel('source'))}>
                <FileCode2 size={16} />
                编辑整个文件
              </button>
              <button onClick={() => action(() => state.setPanel('history'))}>
                <History size={16} />
                编辑历史与版本
              </button>
              <button onClick={() => action(() => state.setSelecting(!state.selecting))}>
                <Check size={16} />
                {state.selecting ? '结束选择' : '批量整理'}
              </button>
              <button onClick={() => action(() => state.setSettingsOpen(true))}>
                <Settings2 size={16} />
                外观与阅读
              </button>
              <button
                className="sm:hidden"
                onClick={() => action(() => state.setPanel('document'))}
              >
                <FileCode2 size={16} />
                日记设置
              </button>
              <div className="mt-2 flex items-center justify-between px-3 py-1 text-xs text-neutral-400">
                <span>外观</span>
                <ThemeToggle />
              </div>
            </>
          )
        }}
      </Popover>
      <input
        ref={fileInput}
        type="file"
        accept=".md"
        hidden
        onChange={(event) => {
          if (event.target.files?.length) void state.openFiles(filesFromInput(event.target.files))
          event.target.value = ''
        }}
      />
      <input
        ref={dirInput}
        type="file"
        hidden
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          if (event.target.files?.length) void state.openFiles(filesFromInput(event.target.files))
          event.target.value = ''
        }}
      />
    </header>
  )
}
