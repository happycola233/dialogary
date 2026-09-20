import { Plus, Trash2 } from 'lucide-react'
import type { Annotation } from '../parser/types'
import { Field, fieldClass, mutedButtonClass } from './EditorDialog'

export function AnnotationsEditor({ annotations, onChange, selectedQuote }: {
  annotations: Annotation[]
  onChange: (annotations: Annotation[]) => void
  selectedQuote?: string
}) {
  const update = (index: number, patch: Partial<Annotation>) => onChange(annotations.map((annotation, i) => i === index ? { ...annotation, ...patch, updatedAt: new Date().toISOString() } : annotation))
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-neutral-500">留下一点回望时的想法，也可以摘录一句话，给它单独写一条批注。</p>
    {annotations.map((annotation, index) => <section key={annotation.id} className="space-y-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-800/40">
      <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">批注 {index + 1}{annotation.createdAt ? ` · ${annotation.createdAt.slice(0, 10)}` : ''}</span><button type="button" aria-label={`删除批注 ${index + 1}`} className={mutedButtonClass} onClick={() => onChange(annotations.filter((_, i) => i !== index))}><Trash2 size={15} /></button></div>
      <Field label="摘录（可选）"><textarea rows={2} value={annotation.quote ?? ''} onChange={(event) => update(index, { quote: event.target.value || undefined })} placeholder="这条批注对应的原文" className={`${fieldClass} resize-y`} /></Field>
      <Field label="批注"><textarea rows={4} value={annotation.text} onChange={(event) => update(index, { text: event.target.value })} placeholder="写下你的想法，支持 Markdown…" className={`${fieldClass} resize-y leading-7`} /></Field>
    </section>)}
    <button type="button" className={mutedButtonClass} onClick={() => onChange([...annotations, { id: `note_${crypto.randomUUID()}`, text: '', ...(selectedQuote ? { quote: selectedQuote } : {}), createdAt: new Date().toISOString() }])}><Plus size={16} />添加批注</button>
  </div>
}
