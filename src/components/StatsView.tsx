import { useId, useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpRight, Download, SlidersHorizontal } from 'lucide-react'
import { EditorDialog } from '../editor/EditorDialog'
import { formatDuration } from '../lib/format'
import { useAppStore } from '../model/store'
import {
  computeStats,
  filterStatsMessages,
  modelName,
  previousPeriod,
  shiftDay,
  TOKEN_FIELDS,
  type FacetRow,
  type Stats,
  type StatsFilter,
  type TokenField,
} from '../model/stats'
import type { DerivedMessage } from '../model/derive'
import { Select } from './ui/Select'

const number = (value: number) => value.toLocaleString('zh-CN')
const compact = (value: number) =>
  value >= 10000 ? `${(value / 10000).toFixed(1)}万` : number(value)
const INPUT_CLASS =
  'min-w-0 rounded-lg bg-neutral-100/80 px-3 py-2 text-sm text-neutral-700 outline-none focus:ring-2 focus:ring-blue-500/50 dark:bg-neutral-800/80 dark:text-neutral-200'
const TOKEN_LABELS: Record<TokenField, string> = {
  input_tokens: '输入',
  output_tokens: '输出',
  cache_read_tokens: '缓存读取',
  cache_write_tokens: '缓存写入',
  reasoning_tokens: '推理',
  total_tokens: '总用量',
}
type Tab = 'overview' | 'personal' | 'usage'
type Drilldown = { title: string; filter?: StatsFilter; ids?: string[] }

export function StatsView() {
  const tabsId = useId()
  const doc = useAppStore((state) => state.doc)
  const [filter, setFilter] = useState<StatsFilter>({})
  const [tab, setTab] = useState<Tab>('overview')
  const [showFilters, setShowFilters] = useState(false)
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null)
  const all = useMemo(() => (doc ? computeStats(doc) : null), [doc])
  const stats = useMemo(() => (doc ? computeStats(doc, filter) : null), [doc, filter])
  const previousFilter = previousPeriod(filter)
  const previous = useMemo(
    () => (doc && previousFilter ? computeStats(doc, previousFilter) : null),
    [doc, previousFilter?.from, previousFilter?.to, filter],
  )
  const matched = useMemo(
    () =>
      doc && drilldown
        ? filterStatsMessages(doc, { ...filter, ...drilldown.filter }).filter(
            (message) => !drilldown.ids || drilldown.ids.includes(message.id),
          )
        : [],
    [doc, drilldown, filter],
  )
  if (!doc || !stats || !all) return null
  const update = (field: keyof StatsFilter, value: string) =>
    setFilter((current) => ({ ...current, [field]: value || undefined }))
  const activeFilters = Object.values(filter).filter(
    (value) => value !== undefined && value !== '' && value !== 'all',
  ).length
  const drill = (title: string, additional: StatsFilter = {}) =>
    setDrilldown({ title, filter: additional })
  const lastRecordedDay = all.lastDate ?? new Date().toISOString().slice(0, 10)
  const matchesPeriod = (days: number) =>
    filter.to === lastRecordedDay && filter.from === shiftDay(lastRecordedDay, 1 - days)
  const range = (days: number) =>
    setFilter((current) => ({
      ...current,
      from: shiftDay(lastRecordedDay, 1 - days),
      to: lastRecordedDay,
    }))

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 pb-24 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            记录里的时光
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {stats.firstDate
              ? `${stats.firstDate} — ${stats.lastDate}`
              : '从第一段记录开始，慢慢看见自己的变化。'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={15} />
            筛选
            {activeFilters > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {activeFilters}
              </span>
            )}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => exportStats(stats)}
          >
            <Download size={15} />
            导出统计
          </button>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        <button
          className={periodClass(!filter.from && !filter.to)}
          aria-pressed={!filter.from && !filter.to}
          onClick={() =>
            setFilter((current) => ({
              ...current,
              from: undefined,
              to: undefined,
            }))
          }
        >
          全部时间
        </button>
        <button
          className={periodClass(matchesPeriod(30))}
          aria-pressed={matchesPeriod(30)}
          onClick={() => range(30)}
        >
          最近记录的 30 天
        </button>
        <button
          className={periodClass(matchesPeriod(365))}
          aria-pressed={matchesPeriod(365)}
          onClick={() => range(365)}
        >
          最近记录的一年
        </button>
        {activeFilters > 0 && (
          <button
            onClick={() => setFilter({})}
            className="ml-auto rounded-md px-2 py-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            清除筛选
          </button>
        )}
      </div>
      {showFilters && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900/60 sm:grid-cols-3 lg:grid-cols-4">
          <FilterField label="起始日期">
            <input
              type="date"
              className={INPUT_CLASS}
              value={filter.from ?? ''}
              max={filter.to}
              onChange={(event) => update('from', event.target.value)}
            />
          </FilterField>
          <FilterField label="结束日期">
            <input
              type="date"
              className={INPUT_CLASS}
              value={filter.to ?? ''}
              min={filter.from}
              onChange={(event) => update('to', event.target.value)}
            />
          </FilterField>
          <FilterField label="内容">
            <Select
              className="w-full"
              value={filter.role ?? ''}
              onChange={(event) => update('role', event.target.value)}
              options={[
                { value: '', label: '全部内容' },
                { value: 'user', label: '我写下的' },
                { value: 'ai', label: 'AI 回复' },
              ]}
            />
          </FilterField>
          <FilterField label="模型">
            <Select
              className="w-full"
              value={filter.model ?? ''}
              onChange={(event) => update('model', event.target.value)}
              options={[
                { value: '', label: '全部模型' },
                ...all.models.map((model) => ({
                  value: model.model,
                  label: model.name + (model.name !== model.model ? ` · ${model.model}` : ''),
                })),
              ]}
            />
          </FilterField>
          {(['tag', 'mood', 'state', 'effort'] as const).map((key) => (
            <FilterField
              key={key}
              label={
                {
                  tag: '标签',
                  mood: '心情',
                  state: '状态',
                  effort: '推理强度',
                }[key]
              }
            >
              <Select
                className="w-full"
                value={filter[key] ?? ''}
                onChange={(event) => update(key, event.target.value)}
                options={[
                  { value: '', label: '全部' },
                  ...all[
                    {
                      tag: 'tags',
                      mood: 'moods',
                      state: 'states',
                      effort: 'efforts',
                    }[key] as 'tags' | 'moods' | 'states' | 'efforts'
                  ].map((item) => ({ value: item.label, label: item.label })),
                ]}
              />
            </FilterField>
          ))}
        </div>
      )}
      {filter.from && filter.to && filter.from > filter.to && (
        <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          结束日期需要在起始日期之后。
        </p>
      )}
      <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
        <Metric
          label="留下记录"
          value={`${number(stats.activeDays)} 天`}
          detail={`最长连续 ${stats.longestStreak} 天`}
          change={previous ? stats.activeDays - previous.activeDays : undefined}
        />
        <Metric
          label="我写下的字"
          value={compact(stats.userChars)}
          detail={`${number(stats.userCount)} 条自己的记录`}
          change={previous ? stats.userChars - previous.userChars : undefined}
        />
        <Metric
          label="AI 的陪伴"
          value={`${number(stats.aiCount)} 条`}
          detail={`${compact(stats.aiChars)} 字回复`}
          change={previous ? stats.aiCount - previous.aiCount : undefined}
        />
        <Metric
          label="值得再读"
          value={`${stats.starred} 条收藏`}
          detail={`${stats.annotationCount} 条批注 · ${stats.attachments} 个附件`}
        />
      </div>
      {previousFilter && (
        <p className="mt-4 text-xs text-neutral-500">
          变化对比 {previousFilter.from} — {previousFilter.to}
          {previous?.messages === 0 ? '；该时段没有符合筛选的记录。' : '，使用相同筛选条件。'}
        </p>
      )}
      <div
        className="mt-8 flex gap-6 border-b border-neutral-100 dark:border-neutral-800"
        role="tablist"
        aria-label="统计内容"
      >
        {(
          [
            ['overview', '记录习惯'],
            ['personal', '表达与心情'],
            ['usage', '模型与用量'],
          ] as const
        ).map(([key, label]) => (
          <button
            role="tab"
            id={`${tabsId}-${key}`}
            aria-controls={`${tabsId}-panel`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            key={key}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              const tabs: Tab[] = ['overview', 'personal', 'usage']
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 2
                    : event.key === 'ArrowRight'
                      ? (tabs.indexOf(tab) + 1) % 3
                      : event.key === 'ArrowLeft'
                        ? (tabs.indexOf(tab) + 2) % 3
                        : -1
              if (next < 0) return
              event.preventDefault()
              setTab(tabs[next]!)
              document.getElementById(`${tabsId}-${tabs[next]}`)?.focus()
            }}
            className={`relative pb-3 text-sm transition-colors ${tab === key ? 'font-medium text-neutral-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-neutral-800 dark:text-white dark:after:bg-neutral-100' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`}>
        {stats.messages === 0 ? (
          <div className="py-20 text-center">
            <p className="text-neutral-500">这个范围里还没有记录</p>
            <button
              onClick={() => setFilter({})}
              className="mt-4 text-sm text-blue-600 dark:text-blue-400"
            >
              查看全部记录
            </button>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-9 pt-7">
                <Section
                  title="记录日历"
                  description="每一个有颜色的日子，都留下了你的声音。点选一天重读。"
                >
                  <CalendarHeatmap
                    stats={stats}
                    onSelect={(date) => drill(date, { from: date, to: date })}
                  />
                </Section>
                <Section title="每月的对话">
                  <MonthlyChart
                    stats={stats}
                    onSelect={(ym) =>
                      drill(`${ym} 的记录`, {
                        from: `${ym}-01`,
                        to: monthEnd(ym),
                      })
                    }
                  />
                </Section>
                <div className="grid gap-8 lg:grid-cols-2">
                  <Section
                    title="记录时段"
                    description={`${stats.timedMessages} / ${stats.messages} 条记录有明确时分`}
                  >
                    <HourChart
                      stats={stats}
                      onSelect={(hour) => drill(`${hour}:00 — ${hour}:59 的记录`, { hour })}
                    />
                  </Section>
                  <Section title="聊得最多的日子">
                    <div className="space-y-1">
                      {stats.topDays.map((day, index) => (
                        <button
                          key={day.date}
                          onClick={() => drill(day.date, { from: day.date, to: day.date })}
                          className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        >
                          <span className="w-4 text-xs text-neutral-400">{index + 1}</span>
                          <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">
                            {day.date}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {day.count} 条 · 我写了 {compact(day.userChars)} 字
                          </span>
                          <ArrowUpRight size={13} className="text-neutral-400" />
                        </button>
                      ))}
                    </div>
                  </Section>
                </div>
              </div>
            )}
            {tab === 'personal' && (
              <div className="space-y-9 pt-7">
                <Section
                  title="文字里的自己"
                  description="按 Unicode 字符统计，正文、推理、进展和批注分开计算。"
                >
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
                    {[
                      ['我的正文', stats.userChars],
                      ['AI 正文', stats.aiChars],
                      ['推理过程', stats.thinkingChars],
                      ['进展说明', stats.commentaryChars],
                      ['我的批注', stats.annotationChars],
                    ].map(([label, count]) => (
                      <div key={label}>
                        <p className="text-xs text-neutral-500">{label}</p>
                        <p className="mt-2 text-xl tabular-nums text-neutral-800 dark:text-neutral-200">
                          {compact(Number(count))}
                          <span className="ml-1 text-xs text-neutral-400">字</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
                <div className="grid gap-9 sm:grid-cols-2">
                  <Section
                    title="常聊的话题"
                    description="包含当天与消息上的标签，点选查看相关记录。"
                  >
                    <FacetList
                      rows={stats.tags}
                      empty="给记录加上标签，慢慢整理关心的话题。"
                      onSelect={(tag) => drill(`#${tag}`, { tag })}
                    />
                  </Section>
                  <Section title="心情印记" description="只统计你亲手留下的心情。">
                    <FacetList
                      rows={stats.moods}
                      empty="还没有留下心情，编辑记录时可以添上一笔。"
                      color="bg-rose-300 dark:bg-rose-500"
                      onSelect={(mood) => drill(`心情 · ${mood}`, { mood })}
                    />
                  </Section>
                  <Section title="生活状态">
                    <FacetList
                      rows={stats.states}
                      empty="还没有标记生活状态。"
                      color="bg-amber-300 dark:bg-amber-500"
                      onSelect={(state) => drill(`状态 · ${state}`, { state })}
                    />
                  </Section>
                  <Section title="收藏与批注">
                    <div className="space-y-1">
                      {filterStatsMessages(doc, filter)
                        .filter((message) => message.annotations?.length || message.starred)
                        .slice(0, 6)
                        .map((message) => (
                          <MessageLink key={message.id} message={message} />
                        ))}
                      {!stats.annotationCount && !stats.starred && (
                        <Empty>收藏一句话，或写下重读时的新想法。</Empty>
                      )}
                    </div>
                  </Section>
                </div>
                <Section title="一段话的长度">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {stats.lengthDist.map((bucket) => (
                      <div
                        key={bucket.label}
                        className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900"
                      >
                        <p className="text-xs text-neutral-500">{bucket.label} 字</p>
                        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                          我 {bucket.user} · AI {bucket.ai}
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            )}
            {tab === 'usage' && (
              <div className="space-y-9 pt-7">
                <Section
                  title="Token 用量"
                  description={`${stats.aiCount} 条 AI 回复中，${stats.usageRecorded} 条记录了用量。未记录的字段保留为空。`}
                >
                  <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3">
                    {TOKEN_FIELDS.map((key) => (
                      <Metric
                        key={key}
                        label={TOKEN_LABELS[key]}
                        value={
                          stats.tokens[key].recorded ? number(stats.tokens[key].total) : '未记录'
                        }
                        detail={`${stats.tokens[key].recorded} / ${stats.aiCount} 条有记录`}
                      />
                    ))}
                  </div>
                  <div className="mt-6 rounded-xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-500 dark:bg-neutral-900">
                    <p>输入包含缓存读取和写入，输出包含推理用量；明细不会重复计入总用量。</p>
                    <p>
                      缓存读取占比：
                      <span className="font-medium text-neutral-700 dark:text-neutral-200">
                        {stats.cacheHitRate === null
                          ? '未记录'
                          : `${(stats.cacheHitRate * 100).toFixed(1)}%`}
                      </span>{' '}
                      · {stats.cacheComparableMessages} 条回复同时记录了输入与缓存读取。
                    </p>
                    <p>
                      思考耗时：
                      {stats.thinkingDurationRecorded
                        ? formatDuration(stats.thinkingTotalSeconds)
                        : '未记录'}{' '}
                      · {stats.thinkingDurationRecorded} / {stats.thinkingCount} 条思考过程有耗时。
                    </p>
                  </div>
                </Section>
                <Section title="用量随时间变化">
                  <MonthlyChart
                    stats={stats}
                    usage
                    onSelect={(ym) =>
                      drill(`${ym} 的 AI 回复`, {
                        from: `${ym}-01`,
                        to: monthEnd(ym),
                        role: 'ai',
                      })
                    }
                  />
                </Section>
                <div className="grid gap-9 lg:grid-cols-2">
                  <Section title="常用模型">
                    <div className="space-y-4">
                      {stats.models.length ? (
                        stats.models.map((model) => (
                          <button
                            key={model.model}
                            onClick={() =>
                              drill(`模型 · ${model.name}`, {
                                model: model.model,
                              })
                            }
                            className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          >
                            <div className="mb-1.5 flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-neutral-700 dark:text-neutral-200">
                                  {model.name}
                                </span>
                                {model.name !== model.model && (
                                  <span className="block truncate font-mono text-[11px] text-neutral-500">
                                    {model.model}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-xs text-neutral-500">
                                {model.count} 条
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
                              <div
                                className="h-full rounded-full bg-blue-400 dark:bg-blue-500"
                                style={{
                                  width: `${(model.count / stats.models[0]!.count) * 100}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1.5 text-[11px] text-neutral-500">
                              {model.firstDate} — {model.lastDate} · {model.usageRecorded} 条有用量
                            </p>
                          </button>
                        ))
                      ) : (
                        <Empty>还没有记录模型信息。</Empty>
                      )}
                    </div>
                  </Section>
                  <Section title="推理强度">
                    <FacetList
                      rows={stats.efforts}
                      empty="还没有记录推理强度。"
                      onSelect={(effort) => drill(`推理强度 · ${effort}`, { effort })}
                    />
                  </Section>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {drilldown && (
        <DrilldownPanel
          title={drilldown.title}
          messages={matched}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  )
}

const periodClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 transition-colors ${active ? 'bg-[var(--dg-accent-soft)] font-medium text-[var(--dg-accent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--dg-accent)_25%,transparent)]' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-900 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`
function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-neutral-500">
      {label}
      {children}
    </label>
  )
}
function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{title}</h2>
      {description && <p className="mt-1.5 text-xs leading-5 text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-sm leading-6 text-neutral-500">{children}</p>
}
function Metric({
  label,
  value,
  detail,
  change,
}: {
  label: string
  value: string
  detail: string
  change?: number
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-medium tracking-tight text-neutral-900 tabular-nums dark:text-neutral-100">
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-neutral-500">{detail}</p>
      {change !== undefined && (
        <p className="mt-1 text-[11px] text-neutral-500">
          较前一时段 {change > 0 ? '+' : ''}
          {number(change)}
        </p>
      )}
    </div>
  )
}

function CalendarHeatmap({ stats, onSelect }: { stats: Stats; onSelect: (date: string) => void }) {
  const colors = [0, 1, 2, 3, 4].map((level) => `var(--dg-heat-${level})`)
  return (
    <div className="hc-scrollbar overflow-x-auto pb-2">
      <div className="min-w-max space-y-5">
        {stats.calendar.map(({ year, days, max }) => (
          <div key={year} className="flex gap-4">
            <span className="pt-1 text-xs text-neutral-500">{year}</span>
            <div
              className="grid grid-flow-col gap-[3px]"
              style={{
                gridTemplateRows: 'repeat(7, 11px)',
                gridAutoColumns: '11px',
              }}
            >
              {days.map((day, index) => {
                const offset = new Date(`${year}-01-01T00:00:00Z`).getUTCDay()
                const level = day.count
                  ? 1 + Math.min(3, Math.floor((3 * day.count) / Math.max(1, max)))
                  : 0
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={!day.count}
                    aria-label={`${day.date}，${day.count} 条记录`}
                    title={`${day.date} · ${day.count} 条 · 我写了 ${day.userChars} 字`}
                    onClick={() => onSelect(day.date)}
                    className="rounded-[3px] outline-none enabled:hover:ring-2 enabled:hover:ring-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{
                      background: colors[level],
                      gridRow: ((offset + index) % 7) + 1,
                      gridColumn: Math.floor((offset + index) / 7) + 1,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
          <span>少</span>
          {colors.map((color) => (
            <span key={color} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  )
}

function MonthlyChart({
  stats,
  usage = false,
  onSelect,
}: {
  stats: Stats
  usage?: boolean
  onSelect: (month: string) => void
}) {
  const [usageField, setUsageField] = useState<TokenField | 'io'>('io')
  const single = usage && usageField !== 'io'
  const keys = usage ? (single ? ['selected'] : ['input', 'output']) : ['user', 'ai']
  const labels = usage ? (single ? [TOKEN_LABELS[usageField]] : ['输入', '输出']) : ['我', 'AI']
  const data = stats.monthly.map((row) => ({
    ...row,
    input: row.tokenTotals.input_tokens ?? null,
    output: row.tokenTotals.output_tokens ?? null,
    selected: single ? (row.tokenTotals[usageField] ?? null) : null,
  }))
  const hasUsage = data.some((row) =>
    keys.some((key) => row[key as 'input' | 'output' | 'selected'] != null),
  )
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-xs text-neutral-500">
          {labels.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              <i
                className="h-2 w-2 rounded-full"
                style={{
                  background: index ? 'var(--dg-chart-secondary)' : 'var(--dg-chart-primary)',
                }}
              />
              {label}
            </span>
          ))}
        </div>
        {usage && (
          <Select
            aria-label="用量趋势指标"
            size="sm"
            value={usageField}
            onChange={(event) => setUsageField(event.target.value as TokenField | 'io')}
            options={[
              { value: 'io', label: '输入与输出' },
              ...TOKEN_FIELDS.map((key) => ({
                value: key,
                label: TOKEN_LABELS[key],
              })),
            ]}
          />
        )}
      </div>
      {usage && !hasUsage ? (
        <Empty>所选时段还没有记录这项用量。</Empty>
      ) : (
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              accessibilityLayer
              margin={{ top: 5, right: 0, left: -15, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--dg-chart-grid)" strokeDasharray="3 5" />
              <XAxis
                dataKey="ym"
                tick={{ fontSize: 11, fill: 'var(--dg-chart-label)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--dg-chart-label)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={compact}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--dg-chart-hover)', radius: 6 }}
                contentStyle={{
                  background: 'var(--dg-chart-tooltip)',
                  color: 'var(--dg-chart-text)',
                  border: 0,
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: '0 3px 18px #00000012',
                }}
                formatter={(value, name) => [
                  number(Number(value)),
                  labels[name === keys[0] ? 0 : 1],
                ]}
              />
              {keys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="total"
                  fill={index ? 'var(--dg-chart-secondary)' : 'var(--dg-chart-primary)'}
                  radius={index || single ? [5, 5, 0, 0] : 0}
                  maxBarSize={32}
                  isAnimationActive={false}
                  onClick={(item) => onSelect(String(item.payload.ym))}
                  cursor="pointer"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-3 text-xs text-neutral-500">
        <summary className="w-fit cursor-pointer rounded px-1 py-1 hover:text-neutral-800 dark:hover:text-neutral-200">
          查看每月明细
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2 font-normal">月份</th>
                {labels.map((label) => (
                  <th key={label} className="font-normal">
                    {label}
                  </th>
                ))}
                <th className="font-normal">记录</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.ym}>
                  <td className="py-2">{row.ym}</td>
                  {keys.map((key) => (
                    <td key={key}>
                      {row[key as 'user' | 'ai' | 'input' | 'output' | 'selected'] == null
                        ? '未记录'
                        : number(row[key as 'user' | 'ai' | 'input' | 'output' | 'selected']!)}
                    </td>
                  ))}
                  <td>
                    <button
                      className="text-blue-600 dark:text-blue-400"
                      onClick={() => onSelect(row.ym)}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}
function HourChart({ stats, onSelect }: { stats: Stats; onSelect: (hour: number) => void }) {
  const max = Math.max(...stats.hourHist.map((row) => row.count), 1)
  return (
    <div>
      <div className="flex h-36 items-end gap-1">
        {stats.hourHist.map(({ hour, count }) => (
          <button
            key={hour}
            disabled={!count}
            onClick={() => onSelect(hour)}
            title={`${hour}:00 — ${hour}:59 · ${count} 条`}
            aria-label={`${hour} 时，${count} 条记录`}
            className="group flex h-full min-w-0 flex-1 items-end rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span
              className="dg-hour-bar w-full rounded-t-[4px] transition-colors"
              style={{
                height: `${Math.max(2, (count / max) * 100)}%`,
                opacity: count ? 1 : 0.2,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
        <span>0 时</span>
        <span>6 时</span>
        <span>12 时</span>
        <span>18 时</span>
        <span>23 时</span>
      </div>
    </div>
  )
}
function FacetList({
  rows,
  empty,
  color = 'bg-[var(--dg-chart-primary)]',
  onSelect,
}: {
  rows: FacetRow[]
  empty: string
  color?: string
  onSelect: (value: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <div className="space-y-3">
      {(expanded ? rows : rows.slice(0, 8)).map((row) => (
        <button
          key={row.label}
          onClick={() => onSelect(row.label)}
          className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <div className="mb-1.5 flex justify-between gap-3 text-sm">
            <span className="truncate text-neutral-700 dark:text-neutral-300">{row.label}</span>
            <span className="text-xs text-neutral-500">{row.count} 条</span>
          </div>
          <div className="h-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${(row.count / rows[0]!.count) * 100}%` }}
            />
          </div>
        </button>
      ))}
      {rows.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} className="pt-1 text-xs text-neutral-500">
          {expanded ? '收起' : `查看全部 ${rows.length} 项`}
        </button>
      )}
    </div>
  )
}
function MessageLink({ message }: { message: DerivedMessage }) {
  const requestJump = useAppStore((state) => state.requestJump)
  return (
    <button
      onClick={() => requestJump(message.id, { flash: true })}
      className="block w-full rounded-lg px-2 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      <span className="text-xs text-neutral-500">
        {message.effectiveDate ?? '未标日期'} ·{' '}
        {message.role === 'user'
          ? '我'
          : message.role === 'ai'
            ? modelName(message) || 'AI'
            : '系统'}
      </span>
      <span className="mt-1 block truncate text-sm text-neutral-700 dark:text-neutral-300">
        {message.annotations?.[0]?.text || message.content || '查看记录'}
      </span>
    </button>
  )
}
function DrilldownPanel({
  title,
  messages,
  onClose,
}: {
  title: string
  messages: DerivedMessage[]
  onClose: () => void
}) {
  const [limit, setLimit] = useState(40)
  return (
    <EditorDialog
      title={title}
      subtitle={`${messages.length} 条记录 · 点选返回原文`}
      onClose={onClose}
      drawer
    >
      <div>
        {messages.slice(0, limit).map((message) => (
          <MessageLink key={message.id} message={message} />
        ))}
        {messages.length > limit && (
          <button
            onClick={() => setLimit(limit + 40)}
            className="my-4 w-full rounded-lg bg-neutral-100 py-2 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
          >
            继续查看
          </button>
        )}
        {!messages.length && <Empty>没有符合条件的记录。</Empty>}
      </div>
    </EditorDialog>
  )
}
function monthEnd(ym: string) {
  const value = new Date(`${ym}-01T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + 1)
  value.setUTCDate(0)
  return value.toISOString().slice(0, 10)
}
function exportStats(stats: Stats) {
  const rows: (string | number)[][] = [
    ['月份', '我的消息', 'AI 回复', '输入 Token', '输出 Token', '有用量的回复'],
  ]
  for (const row of stats.monthly)
    rows.push([
      row.ym,
      row.user,
      row.ai,
      row.tokenTotals.input_tokens ?? '',
      row.tokenTotals.output_tokens ?? '',
      row.usageRecorded,
    ])
  rows.push([], ['用量字段', '已记录总量', '有记录的回复', 'AI 回复总数'])
  for (const key of TOKEN_FIELDS)
    rows.push([
      TOKEN_LABELS[key],
      stats.tokens[key].recorded ? stats.tokens[key].total : '',
      stats.tokens[key].recorded,
      stats.aiCount,
    ])
  rows.push([], ['日期', '消息数', '我的字数'])
  for (const day of stats.daily) rows.push([day.date, day.count, day.userChars])
  rows.push([], ['模型 ID', '模型名称', '消息数', '有用量的回复'])
  for (const model of stats.models)
    rows.push([model.model, model.name, model.count, model.usageRecorded])
  for (const [name, items] of [
    ['标签', stats.tags],
    ['心情', stats.moods],
    ['状态', stats.states],
    ['推理强度', stats.efforts],
  ] as const) {
    rows.push([], [name, '消息数'])
    for (const item of items) rows.push([item.label, item.count])
  }
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          // 标签和模型名来自可编辑文件，导出后仍应被表格软件视为文字。
          const text =
            typeof cell === 'string' && /^[=+@\-\t\r]/.test(cell) ? `'${cell}` : String(cell)
          return `"${text.replaceAll('"', '""')}"`
        })
        .join(','),
    )
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = '对话日记-统计.csv'
  link.click()
  URL.revokeObjectURL(url)
}
