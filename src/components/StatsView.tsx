import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDuration } from '../lib/format'
import { useIsDark } from '../lib/useIsDark'
import { useAppStore } from '../model/store'
import { computeStats, type Stats } from '../model/stats'

/** 图表色 token（已用 dataviz 验证器对浅/深表面双模式验证通过） */
const VIZ = {
  light: {
    user: '#2a78d6',
    ai: '#008300',
    single: '#256abf',
    grid: '#e5e5e5',
    muted: '#898781',
    surface: '#ffffff',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e5e5',
    calendar: ['#f0f0f0', '#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#184f95'],
  },
  dark: {
    user: '#3987e5',
    ai: '#008300',
    single: '#3987e5',
    grid: '#2c2c2a',
    muted: '#898781',
    surface: '#171717',
    tooltipBg: '#262626',
    tooltipBorder: '#404040',
    calendar: ['#262626', '#104281', '#1c5cab', '#256abf', '#3987e5', '#86b6ef'],
  },
} as const

type Viz = (typeof VIZ)['light'] | (typeof VIZ)['dark']

export function StatsView() {
  const doc = useAppStore((s) => s.doc)
  const dark = useIsDark()
  const viz = dark ? VIZ.dark : VIZ.light
  const stats = useMemo(() => (doc ? computeStats(doc) : null), [doc])
  if (!doc || !stats) return null

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 pb-24">
      <StatTiles stats={stats} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="每月消息数" full>
          <SeriesLegend viz={viz} />
          <MonthlyChart stats={stats} viz={viz} />
        </Card>
        <Card title="记录日历" full>
          <CalendarHeatmap stats={stats} viz={viz} />
        </Card>
        <Card title="发消息时段">
          <HourChart stats={stats} viz={viz} />
        </Card>
        <Card title="消息长度分布（字符）">
          <SeriesLegend viz={viz} />
          <LengthChart stats={stats} viz={viz} />
        </Card>
        <Card title="模型使用">
          <ModelList stats={stats} viz={viz} />
        </Card>
        <Card title="聊得最多的日子">
          <TopDays stats={stats} />
        </Card>
      </div>
    </div>
  )
}

function Card({ title, full, children }: { title: string; full?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${full ? 'lg:col-span-2' : ''}`}
    >
      <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">{title}</h2>
      {children}
    </section>
  )
}

function StatTiles({ stats }: { stats: Stats }) {
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: '记录天数', value: String(stats.activeDays), sub: `跨度 ${stats.spanDays} 天` },
    { label: '消息', value: String(stats.messages), sub: `我 ${stats.userCount} · AI ${stats.aiCount}` },
    {
      label: '我写下的字',
      value: formatChars(stats.userChars),
      sub: `AI 回了 ${formatChars(stats.aiChars)}`,
    },
    {
      label: 'AI 思考',
      value: stats.thinkingTotalSeconds ? formatDuration(stats.thinkingTotalSeconds) : '—',
      sub: `${stats.thinkingCount} 次`,
    },
    { label: '图片与文件', value: String(stats.attachments) },
    { label: '最长连续', value: `${stats.longestStreak} 天` },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-neutral-200/80 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{t.label}</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">{t.value}</div>
          {t.sub && <div className="mt-0.5 truncate text-[11px] text-neutral-400 dark:text-neutral-500">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function formatChars(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n)
}

function SeriesLegend({ viz }: { viz: Viz }) {
  return (
    <div className="mb-2 flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: viz.user }} />我
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: viz.ai }} />AI
      </span>
    </div>
  )
}

const tooltipStyle = (viz: Viz) =>
  ({
    backgroundColor: viz.tooltipBg,
    border: `1px solid ${viz.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 12,
    padding: '6px 10px',
  }) as const

function MonthlyChart({ stats, viz }: { stats: Stats; viz: Viz }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={stats.monthly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={viz.grid} />
        <XAxis
          dataKey="ym"
          tickFormatter={(ym: string) => (ym.endsWith('-01') ? ym.slice(0, 4) : String(Number(ym.slice(5))))}
          tick={{ fontSize: 10, fill: viz.muted }}
          tickLine={false}
          axisLine={{ stroke: viz.grid }}
          interval={0}
        />
        <YAxis tick={{ fontSize: 10, fill: viz.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: viz.grid, opacity: 0.35 }}
          contentStyle={tooltipStyle(viz)}
          formatter={(value, name) => [Number(value ?? 0), name === 'user' ? '我' : 'AI']}
        />
        <Bar dataKey="user" stackId="m" fill={viz.user} stroke={viz.surface} strokeWidth={1} />
        <Bar dataKey="ai" stackId="m" fill={viz.ai} stroke={viz.surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HourChart({ stats, viz }: { stats: Stats; viz: Viz }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={stats.hourHist} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={viz.grid} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => (h % 6 === 0 ? `${h}时` : '')}
          tick={{ fontSize: 10, fill: viz.muted }}
          tickLine={false}
          axisLine={{ stroke: viz.grid }}
          interval={0}
        />
        <YAxis tick={{ fontSize: 10, fill: viz.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: viz.grid, opacity: 0.35 }}
          contentStyle={tooltipStyle(viz)}
          labelFormatter={(h) => `${h}:00 – ${h}:59`}
          formatter={(value) => [Number(value ?? 0), '消息']}
        />
        <Bar dataKey="count" fill={viz.single} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LengthChart({ stats, viz }: { stats: Stats; viz: Viz }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={stats.lengthDist} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={viz.grid} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: viz.muted }} tickLine={false} axisLine={{ stroke: viz.grid }} interval={0} />
        <YAxis tick={{ fontSize: 10, fill: viz.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: viz.grid, opacity: 0.35 }}
          contentStyle={tooltipStyle(viz)}
          formatter={(value, name) => [Number(value ?? 0), name === 'user' ? '我' : 'AI']}
        />
        <Bar dataKey="user" fill={viz.user} radius={[3, 3, 0, 0]} />
        <Bar dataKey="ai" fill={viz.ai} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** GitHub 式记录日历：列 = 周，行 = 星期；点击有记录的格子跳转到当天 */
function CalendarHeatmap({ stats, viz }: { stats: Stats; viz: Viz }) {
  const doc = useAppStore((s) => s.doc)
  const requestJump = useAppStore((s) => s.requestJump)
  const setView = useAppStore((s) => s.setView)

  const dateToMsg = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of doc?.sessions ?? []) {
      if (s.date && s.messages[0] && !map.has(s.date)) map.set(s.date, s.messages[0].id)
    }
    return map
  }, [doc])

  return (
    // 内层 w-max + mx-auto：放得下时水平居中，放不下时照常横向滚动
    <div className="hc-scrollbar overflow-x-auto pb-1">
      <div className="mx-auto flex w-max flex-col gap-4">
        {stats.calendar.map(({ year, days, max }) => {
          const jan1 = new Date(`${year}-01-01T00:00:00Z`)
          const offset = jan1.getUTCDay()
          return (
            <div key={year}>
              <div className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">{year}</div>
              <div className="grid grid-flow-col gap-[2px]" style={{ gridTemplateRows: 'repeat(7, 10px)', gridAutoColumns: '10px' }}>
                {days.map((d, i) => {
                  const level = d.count === 0 ? 0 : 1 + Math.min(4, Math.floor((4 * (d.count - 1)) / Math.max(1, max - 1)))
                  return (
                    <div
                      key={d.date}
                      title={`${d.date} · ${d.count} 条`}
                      className={d.count > 0 ? 'cursor-pointer rounded-[2px] hover:ring-1 hover:ring-neutral-400' : 'rounded-[2px]'}
                      style={{
                        background: viz.calendar[level],
                        gridRow: ((offset + i) % 7) + 1,
                        gridColumn: Math.floor((offset + i) / 7) + 1,
                      }}
                      onClick={() => {
                        const id = dateToMsg.get(d.date)
                        if (id) {
                          setView('chat')
                          requestJump(id)
                        }
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
          少
          {viz.calendar.map((c, i) => (
            <span key={i} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: c }} />
          ))}
          多
        </div>
      </div>
    </div>
  )
}

/** 模型使用：横向条形（单色系，直接标注数值） */
function ModelList({ stats, viz }: { stats: Stats; viz: Viz }) {
  if (stats.models.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-400">没有标注过模型名</p>
  }
  const max = stats.models[0]!.count
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {stats.models.map((m) => (
        <div key={m.model}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-mono text-neutral-600 dark:text-neutral-300">{m.model}</span>
            <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
              {m.count} 条{m.firstDate && ` · ${m.firstDate.slice(0, 7)} ~ ${m.lastDate?.slice(0, 7)}`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div className="h-full rounded-full" style={{ width: `${(m.count / max) * 100}%`, background: viz.single }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TopDays({ stats }: { stats: Stats }) {
  const requestJump = useAppStore((s) => s.requestJump)
  const setView = useAppStore((s) => s.setView)
  return (
    <div className="flex flex-col">
      {stats.topDays.map((d, i) => (
        <button
          key={d.date}
          type="button"
          onClick={() => {
            setView('chat')
            requestJump(d.firstMsgId)
          }}
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
        >
          <span className="w-5 shrink-0 text-center font-mono text-xs text-neutral-300 dark:text-neutral-600">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
            {d.date}
            {d.title && <span className="text-neutral-400 dark:text-neutral-500"> · {d.title}</span>}
          </span>
          <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{d.count} 条</span>
        </button>
      ))}
    </div>
  )
}
