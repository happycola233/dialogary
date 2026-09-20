import {
  BarChart3,
  BookOpen,
  Bookmark,
  ChevronDown,
  Feather,
  History,
  SearchCheck,
  Search,
  Settings2,
  Tags,
  TextSearch,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { formatMonthCn } from '../lib/format'
import { hasFilters } from '../model/filters'
import { savedViewsOf, useAppStore } from '../model/store'

export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const state = useAppStore()
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const dateListRef = useRef<HTMLDivElement>(null)
  const initializedSourceRef = useRef<string | null>(null)
  const doc = state.doc

  useLayoutEffect(() => {
    const dateList = dateListRef.current
    if (!doc || !dateList || collapsed) return
    const initialSource = initializedSourceRef.current !== state.sourceKey
    const alignDateList = () => {
      initializedSourceRef.current = state.sourceKey
      if (initialSource) {
        dateList.scrollTop = dateList.scrollHeight
        // 移动端目录重新打开时，正文已经停在某一天，直接让这一天可见。
        if (!onNavigate) return
      }
      if (state.view !== 'chat' || state.jumpTarget) return
      const active = dateList.querySelector<HTMLElement>(
        `[data-nav-session="${state.activeSession}"]`,
      )
      if (!active) return
      // 只调整日期列表自己的滚动位置，避免 scrollIntoView 连带滚动正文或移动端抽屉。
      const viewport = dateList.getBoundingClientRect()
      const item = active.getBoundingClientRect()
      const padding = 8
      if (item.top < viewport.top + padding) dateList.scrollTop += item.top - viewport.top - padding
      else if (item.bottom > viewport.bottom - padding)
        dateList.scrollTop += item.bottom - viewport.bottom + padding
    }
    // 原生 dialog 在父级 effect 中 showModal 后才有尺寸；下一帧再测量抽屉。
    const frame = requestAnimationFrame(alignDateList)
    return () => cancelAnimationFrame(frame)
  }, [doc, state.sourceKey, state.activeSession, state.jumpTarget, state.view, collapsed])

  if (!doc) return null
  const navigate = (callback: () => void) => {
    callback()
    onNavigate?.()
  }
  const nav = [
    {
      label: '所有记录',
      icon: BookOpen,
      active: state.view === 'chat' && state.readMode === 'conversation' && !state.filters.starred,
      action: () => {
        state.setView('chat')
        state.setReadMode('conversation')
        if (state.filter !== 'all' || hasFilters(state.filters)) state.clearFilters()
      },
    },
    {
      label: '我的日记',
      icon: Feather,
      active: state.view === 'chat' && state.readMode === 'diary',
      action: () => {
        state.setView('chat')
        state.setReadMode('diary')
        if (state.filter !== 'all' || hasFilters(state.filters)) state.clearFilters()
      },
    },
    {
      label: '时光回顾',
      icon: History,
      active: state.view === 'review',
      action: () => state.setView('review'),
    },
    {
      label: '记录统计',
      icon: BarChart3,
      active: state.view === 'stats',
      action: () => state.setView('stats'),
    },
  ]
  return (
    <div
      className={clsx(
        'dg-sidebar-content flex h-full flex-col pb-4 pt-3',
        collapsed && 'is-collapsed',
      )}
    >
      <nav aria-label="主要导航" className="space-y-1">
        {nav.map(({ icon: Icon, ...item }) => (
          <button
            key={item.label}
            className={clsx('dg-nav', item.active && 'is-active')}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            onClick={() => navigate(item.action)}
          >
            <Icon size={17} strokeWidth={1.6} />
            <span className="dg-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="dg-nav-detail my-5 px-2 text-[10px] font-medium tracking-widest text-neutral-400">
        整理与查找
      </div>
      <div className="space-y-0.5">
        <button
          className="dg-nav"
          title={collapsed ? '我的收藏' : undefined}
          aria-label="我的收藏"
          onClick={() =>
            navigate(() => {
              state.clearFilters()
              state.setReadMode('conversation')
              state.setFilters({ starred: true })
            })
          }
        >
          <Bookmark size={16} />
          <span className="dg-nav-label">我的收藏</span>
          <span className="dg-nav-label ml-auto text-[11px] text-neutral-400">
            {doc.messages.filter((message) => message.starred).length || ''}
          </span>
        </button>
        <button
          className="dg-nav"
          title={collapsed ? '标签管理' : undefined}
          aria-label="标签管理"
          onClick={() => navigate(() => state.setPanel('tags'))}
        >
          <Tags size={16} />
          <span className="dg-nav-label">标签管理</span>
        </button>
        <button
          className="dg-nav"
          title={collapsed ? '查找与替换' : undefined}
          aria-label="查找与替换"
          onClick={() => navigate(() => state.setPanel('replace'))}
        >
          <TextSearch size={16} />
          <span className="dg-nav-label">查找与替换</span>
        </button>
      </div>
      {savedViewsOf(doc).length > 0 && (
        <div className="dg-nav-detail mt-4" inert={collapsed}>
          <p className="mb-2 px-2 text-[10px] tracking-widest text-neutral-400">常用筛选</p>
          {savedViewsOf(doc).map((view) => (
            <button
              key={view.id}
              className="dg-nav"
              onClick={() => navigate(() => state.applyView(view))}
            >
              <SearchCheck size={15} />
              <span className="truncate">{view.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="dg-nav-detail mb-2 mt-6 flex items-center justify-between px-2 text-[10px] font-medium tracking-widest text-neutral-400">
        <span>按日期阅读</span>
        <span className="tracking-normal">
          {new Set(doc.sessions.map((session) => session.date)).size} 天
        </span>
      </div>
      <div
        ref={dateListRef}
        aria-label="按日期阅读"
        className="dg-nav-detail hc-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        inert={collapsed}
      >
        {doc.months.map((month) => (
          <div key={`${month.ym}-${month.sessions[0]?.index}`} className="mb-3">
            <button
              className="flex w-full items-center justify-between px-2 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400"
              onClick={() =>
                setClosed((current) => {
                  const next = new Set(current)
                  const groupId = `${month.ym}-${month.sessions[0]?.index}`
                  if (next.has(groupId)) next.delete(groupId)
                  else next.add(groupId)
                  return next
                })
              }
              aria-expanded={!closed.has(`${month.ym}-${month.sessions[0]?.index}`)}
            >
              {formatMonthCn(month.ym)}
              <ChevronDown
                size={13}
                className={
                  closed.has(`${month.ym}-${month.sessions[0]?.index}`) ? '-rotate-90' : ''
                }
              />
            </button>
            {!closed.has(`${month.ym}-${month.sessions[0]?.index}`) &&
              month.sessions.map((session) => (
                <button
                  key={session.index}
                  data-nav-session={session.index}
                  className={clsx(
                    'dg-date-nav',
                    state.activeSession === session.index && state.view === 'chat' && 'is-active',
                  )}
                  onClick={() =>
                    navigate(() => {
                      state.setView('chat')
                      const first = session.messages[0]
                      if (first) state.requestJump(first.id, { smooth: true })
                      else state.setDateEditor(session.index)
                    })
                  }
                >
                  <span className="w-10 shrink-0 tabular-nums">
                    {session.date?.slice(5) ?? '未标'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {session.title && !/^(周|星期)[一二三四五六日天]$/.test(session.title)
                      ? session.title
                      : session.weekday}
                  </span>
                  <span className="text-[10px] opacity-50">{session.messages.length}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="dg-rail-tools mt-auto space-y-1" hidden={!collapsed}>
        <button
          className="dg-nav"
          aria-label="搜索记录"
          title="搜索记录"
          onClick={() => state.setSearchOpen(true)}
        >
          <Search size={17} />
        </button>
        <button
          className="dg-nav"
          aria-label="外观与阅读"
          title="外观与阅读"
          onClick={() => state.setSettingsOpen(true)}
        >
          <Settings2 size={17} />
        </button>
      </div>
    </div>
  )
}
