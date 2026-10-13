import { Star } from 'lucide-react'
import type { TokenUsage } from '../parser/types'
import type { MessageDraft } from './types'
import { Field, fieldClass, mutedButtonClass } from './EditorDialog'
import { TokenInput } from './TokenInput'
import { ReactionField } from '../components/ReactionPicker'
import { MoodField } from './PresetPicker'

const tokenFields: { key: keyof TokenUsage; label: string }[] = [
  { key: 'input_tokens', label: '输入 Token' },
  { key: 'output_tokens', label: '输出 Token' },
  { key: 'cache_read_tokens', label: '缓存读取 Token' },
  { key: 'cache_write_tokens', label: '缓存写入 Token' },
  { key: 'reasoning_tokens', label: '推理 Token' },
  { key: 'total_tokens', label: '报告总量 Token' },
]

export function DetailsEditor({
  draft,
  onChange,
  tags = [],
}: {
  draft: MessageDraft
  onChange: (draft: MessageDraft) => void
  tags?: string[]
}) {
  const patch = (value: Partial<MessageDraft>) => onChange({ ...draft, ...value })
  const fromAi = draft.role === 'ai'
  // 模型与用量只属于 AI 回复；其他记录已有这些数据时仍然显示，方便核对或清除。
  const showModel =
    fromAi ||
    Boolean(
      draft.model ||
      draft.modelInfo?.name ||
      draft.modelInfo?.id ||
      draft.modelInfo?.reasoningEffort,
    )
  const showUsage = fromAi || Object.values(draft.usage ?? {}).some((value) => value !== undefined)
  return (
    <div className="space-y-7">
      <div className="dg-details-grid grid gap-5 sm:grid-cols-2">
        <TokenInput
          label="标签"
          presetKind="tags"
          values={draft.tags ?? []}
          onChange={(tags) => patch({ tags })}
          suggestions={tags.slice(0, 12)}
        />
        <ReactionField
          values={draft.reactions ?? []}
          onChange={(reactions) => patch({ reactions })}
        />
      </div>
      <div className="dg-details-grid grid gap-5 sm:grid-cols-2">
        <MoodField value={draft.mood ?? ''} onChange={(mood) => patch({ mood })} />
        <TokenInput
          label="状态"
          presetKind="states"
          values={draft.states ?? []}
          onChange={(states) => patch({ states })}
          placeholder="例如 疲惫、专注"
        />
      </div>
      <button
        type="button"
        aria-pressed={draft.starred ?? false}
        className={mutedButtonClass}
        onClick={() => patch({ starred: !draft.starred })}
      >
        <Star size={17} className={draft.starred ? 'fill-amber-400 text-amber-500' : ''} />
        {draft.starred ? '已收藏这条记录' : '收藏这条记录'}
      </button>
      {showModel && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium">模型</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="模型名称">
              <input
                value={draft.modelInfo?.name ?? draft.model ?? ''}
                onChange={(event) =>
                  patch({
                    model: event.target.value || null,
                    modelInfo: { ...draft.modelInfo, name: event.target.value || undefined },
                  })
                }
                className={fieldClass}
                placeholder="未记录"
              />
            </Field>
            <Field label="模型 ID">
              <input
                value={draft.modelInfo?.id ?? ''}
                onChange={(event) =>
                  patch({ modelInfo: { ...draft.modelInfo, id: event.target.value || undefined } })
                }
                className={fieldClass}
                placeholder="未记录"
              />
            </Field>
            <Field label="推理强度">
              <input
                list="journal-effort-options"
                value={draft.modelInfo?.reasoningEffort ?? ''}
                onChange={(event) =>
                  patch({
                    modelInfo: {
                      ...draft.modelInfo,
                      reasoningEffort: event.target.value || undefined,
                    },
                  })
                }
                className={fieldClass}
                placeholder="未记录"
              />
              <datalist id="journal-effort-options">
                {['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((effort) => (
                  <option value={effort} key={effort} />
                ))}
              </datalist>
            </Field>
          </div>
        </section>
      )}
      {showUsage && (
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">Token 用量</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              输入包含缓存读写，输出包含推理用量。留空表示未记录。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {tokenFields.map(({ key, label }) => (
              <Field label={label} key={key}>
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  step="1"
                  value={typeof draft.usage?.[key] === 'number' ? (draft.usage[key] as number) : ''}
                  onChange={(event) => {
                    const usage = { ...draft.usage }
                    if (event.target.value === '') delete usage[key]
                    else usage[key] = Number(event.target.value)
                    patch({ usage })
                  }}
                  className={fieldClass}
                  placeholder="未记录"
                />
              </Field>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
