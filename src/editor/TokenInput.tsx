import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { fieldClass } from './EditorDialog'
import type { PresetKind } from '../model/presets'
import { PresetPicker, PresetSuggestions } from './PresetPicker'

export function TokenInput({
  label,
  values,
  onChange,
  placeholder = '输入后按回车添加',
  suggestions = [],
  presetKind,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  suggestions?: string[]
  presetKind?: PresetKind
}) {
  const [input, setInput] = useState('')
  const add = (value: string) => {
    const additions = value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
    onChange([...new Set([...values, ...additions])])
    setInput('')
  }
  return (
    <div className="dg-detail-field">
      <div className="dg-detail-field-heading">
        <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {label}
        </span>
        {presetKind && (
          <PresetPicker
            kind={presetKind}
            selected={values}
            onSelect={(value) =>
              values.includes(value)
                ? onChange(values.filter((item) => item !== value))
                : add(value)
            }
          />
        )}
      </div>
      <div className="dg-token-entry">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          aria-label={label}
          placeholder={placeholder}
          className={fieldClass}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add(input)
            }
          }}
          onBlur={() => {
            if (input.trim()) add(input)
          }}
        />
        <button
          type="button"
          aria-label={`添加${label}`}
          className="dg-token-add"
          title={`添加${label}`}
          disabled={!input.trim()}
          onClick={() => add(input)}
        >
          <Plus size={16} />
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--dg-accent-soft)] py-1 pl-3 pr-1.5 text-xs text-[var(--dg-accent)] dark:bg-[var(--dg-accent-soft)] dark:text-[var(--dg-accent)]"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                aria-label={`移除${label} ${value}`}
                className="rounded-full p-1 hover:bg-[var(--dg-accent-soft)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {presetKind ? (
        <PresetSuggestions kind={presetKind} selected={values} onSelect={add} extra={suggestions} />
      ) : (
        suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions
              .filter((item) => !values.includes(item))
              .map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => add(item)}
                  className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {item}
                </button>
              ))}
          </div>
        )
      )}
    </div>
  )
}
