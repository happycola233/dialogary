import { BookOpen, ChevronDown, ListChecks, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '../model/store'
import { hasFilters, matchesFilters } from '../model/filters'
import { EditorDialog, Field, fieldClass, primaryButtonClass } from '../editor/EditorDialog'
import { Select } from './ui/Select'

export function ReadingToolbar() {
  const state = useAppStore()
  const visible = state.doc!.messages.filter(
    (message) =>
      matchesFilters(message, state.filters) &&
      (state.filter === 'all' || message.role === state.filter) &&
      (state.readMode !== 'diary' || message.role === 'user'),
  ).length
  return (
    <div className="mx-auto mb-3 max-w-[var(--dg-content-width)] px-4 pb-1 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--dg-accent)] dark:text-[var(--dg-accent)]">
            {state.readMode === 'diary' ? '留给自己的文字' : '每一次对话，都是生活的注脚'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {state.readMode === 'diary' ? '我的日记' : '所有记录'}
            <span className="ml-3 align-middle text-xs font-normal text-neutral-400">
              {visible} 条
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Select
            aria-label="筛选角色"
            size="sm"
            value={state.filter}
            onChange={(event) => state.setFilter(event.target.value as 'all' | 'user' | 'ai')}
            options={[
              { value: 'all', label: '全部角色' },
              { value: 'user', label: '只看我' },
              { value: 'ai', label: '只看 AI', disabled: state.readMode === 'diary' },
            ]}
          />
          <button
            className="dg-icon"
            aria-label="筛选记录"
            onClick={() => state.setPanel('filters')}
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="dg-icon"
            aria-label="批量选择"
            aria-pressed={state.selecting}
            onClick={() => state.setSelecting(!state.selecting)}
          >
            <ListChecks size={17} />
          </button>
          <button
            className="dg-icon"
            aria-label={state.expandAllThinking ? '折叠全部过程' : '展开全部过程'}
            onClick={() => state.setExpandAllThinking(!state.expandAllThinking)}
          >
            <ChevronDown size={17} className={state.expandAllThinking ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>
      {hasFilters(state.filters) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(state.filters)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <button
                className="dg-chip"
                key={key}
                onClick={() => state.setFilters({ [key]: typeof value === 'boolean' ? false : '' })}
              >
                {
                  (
                    {
                      query: '搜索',
                      from: '从',
                      to: '至',
                      model: '模型',
                      tag: '标签',
                      mood: '心情',
                      state: '状态',
                      starred: '收藏',
                      annotated: '有批注',
                      hasAttachment: '有附件',
                    } as Record<string, string>
                  )[key]
                }
                {typeof value === 'string' ? `：${value}` : ''}
                <X size={11} />
              </button>
            ))}
          <button className="px-2 text-xs text-neutral-400" onClick={state.clearFilters}>
            清除筛选
          </button>
        </div>
      )}
      {visible === 0 && state.doc!.messages.length > 0 && (
        <div className="py-16 text-center">
          <BookOpen className="mx-auto mb-4 text-neutral-300" size={30} />
          <p className="text-sm text-neutral-500">这个范围里还没有记录</p>
          <button
            className="mt-4 text-xs text-[var(--dg-accent)] dark:text-[var(--dg-accent)]"
            onClick={state.clearFilters}
          >
            查看全部记录
          </button>
        </div>
      )}
    </div>
  )
}

export function FilterDialog({ onClose }: { onClose: () => void }) {
  const state = useAppStore()
  const [name, setName] = useState('')
  const facets = useMemo(() => {
    const messages = state.doc!.messages
    const personal = [...messages, ...state.doc!.sessions]
    return {
      model: [
        ...new Set(
          messages
            .map((message) => message.modelInfo?.name || message.modelInfo?.id || message.model)
            .filter(Boolean),
        ),
      ] as string[],
      tag: [...new Set(personal.flatMap((item) => item.tags ?? []))],
      mood: [...new Set(personal.map((item) => item.mood).filter(Boolean))] as string[],
      state: [...new Set(personal.flatMap((item) => item.states ?? []))],
    }
  }, [state.doc])
  return (
    <EditorDialog
      title="找到想重读的记录"
      onClose={onClose}
      footer={
        <>
          <button className="mr-auto text-xs text-neutral-400" onClick={state.clearFilters}>
            清除条件
          </button>
          <button className={primaryButtonClass} onClick={onClose}>
            查看记录
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="包含文字">
          <input
            className={fieldClass}
            value={state.filters.query}
            onChange={(event) => state.setFilters({ query: event.target.value })}
            placeholder="正文、批注、标签或过程"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="起始日期">
            <input
              type="date"
              className={fieldClass}
              value={state.filters.from}
              onChange={(event) => state.setFilters({ from: event.target.value })}
            />
          </Field>
          <Field label="结束日期">
            <input
              type="date"
              className={fieldClass}
              value={state.filters.to}
              onChange={(event) => state.setFilters({ to: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['model', 'tag', 'mood', 'state'] as const).map((key) => (
            <Field
              key={key}
              label={{ model: '模型', tag: '标签', mood: '心情', state: '状态' }[key]}
            >
              <Select
                className="w-full"
                value={state.filters[key]}
                onChange={(event) => state.setFilters({ [key]: event.target.value })}
                options={[
                  { value: '', label: '全部' },
                  ...facets[key].map((item) => ({ value: item, label: item })),
                ]}
              />
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['starred', 'annotated', 'hasAttachment'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--dg-accent)]"
                checked={state.filters[key]}
                onChange={(event) => state.setFilters({ [key]: event.target.checked })}
              />
              {{ starred: '已收藏', annotated: '有批注', hasAttachment: '有附件' }[key]}
            </label>
          ))}
        </div>
        <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-800/40">
          <label className="text-xs text-neutral-500">
            保存为常用筛选
            <input
              aria-label="筛选名称"
              className={`${fieldClass} mt-2 !bg-white dark:!bg-neutral-900`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：读书时的想法"
            />
          </label>
          <button
            disabled={!name.trim()}
            className="mt-3 text-xs text-[var(--dg-accent)] disabled:opacity-40 dark:text-[var(--dg-accent)]"
            onClick={() => {
              state.saveView(name.trim())
              setName('')
              onClose()
            }}
          >
            保存到侧栏
          </button>
        </div>
      </div>
    </EditorDialog>
  )
}
