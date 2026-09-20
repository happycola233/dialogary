import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, File, FilePlus2, GripVertical, Image, Link, Trash2 } from 'lucide-react'
import type { Attachment } from '../parser/types'
import { Field, fieldClass, mutedButtonClass } from './EditorDialog'
import { Select } from '../components/ui/Select'
import './attachments-editor.css'

function AttachmentRow({
  id,
  attachment,
  index,
  total,
  expanded,
  onExpand,
  onUpdate,
  onMove,
  onRemove,
}: {
  id: string
  attachment: Attachment
  index: number
  total: number
  expanded: boolean
  onExpand: () => void
  onUpdate: (patch: Partial<Attachment>) => void
  onMove: (index: number) => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const Icon = attachment.kind === 'image' ? Image : File
  return (
    <section
      ref={setNodeRef}
      className={`dg-attachment-card${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="dg-attachment-row">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`拖动附件 ${index + 1}：${attachment.name || '未命名附件'}`}
          title="拖动排序；也可以按空格后用方向键移动"
          className="dg-attachment-handle"
        >
          <GripVertical size={17} />
        </button>
        <span className="dg-attachment-type">
          <Icon size={20} />
        </span>
        <button
          type="button"
          className="dg-attachment-summary"
          aria-label={`编辑附件 ${index + 1}`}
          aria-expanded={expanded}
          onClick={onExpand}
        >
          <span className="dg-attachment-name">{attachment.name || '未命名附件'}</span>
          <span className="dg-attachment-path">{attachment.path || '添加文件路径或链接'}</span>
        </button>
        <Select
          aria-label={`附件 ${index + 1} 顺序`}
          className="dg-attachment-position"
          size="sm"
          value={String(index)}
          options={Array.from({ length: total }, (_, i) => ({
            value: String(i),
            label: `第 ${i + 1} 位`,
          }))}
          onChange={(event) => onMove(Number(event.target.value))}
        />
        <button
          type="button"
          className="dg-attachment-icon-button"
          aria-label={`${expanded ? '收起' : '展开'}附件 ${index + 1}`}
          title={expanded ? '收起详情' : '编辑详情'}
          onClick={onExpand}
        >
          <ChevronDown size={16} className={expanded ? 'rotate-180' : ''} />
        </button>
        <button
          type="button"
          className="dg-attachment-icon-button dg-attachment-remove"
          aria-label={`移除附件 ${index + 1}`}
          title="移除附件"
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {expanded && (
        <div className="dg-attachment-details">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="显示名称">
              <input
                aria-label={`附件 ${index + 1} 显示名称`}
                value={attachment.name}
                onChange={(event) => onUpdate({ name: event.target.value })}
                className={fieldClass}
              />
            </Field>
            <Field label="类型">
              <Select
                aria-label={`附件 ${index + 1} 类型`}
                className="w-full"
                value={attachment.kind}
                onChange={(event) => onUpdate({ kind: event.target.value as Attachment['kind'] })}
                options={[
                  { value: 'image', label: '图片' },
                  { value: 'file', label: '文件' },
                ]}
              />
            </Field>
          </div>
          <Field label="文件路径或链接">
            <input
              aria-label={`附件 ${index + 1} 文件路径或链接`}
              value={attachment.path ?? ''}
              onChange={(event) => onUpdate({ path: event.target.value || null })}
              placeholder="例如 attachments/photo.jpg"
              className={fieldClass}
            />
          </Field>
        </div>
      )}
    </section>
  )
}

export function AttachmentsEditor({
  attachments,
  onChange,
  onAddFiles,
  onBusyChange,
}: {
  attachments: Attachment[]
  onChange: (attachments: Attachment[]) => void
  onAddFiles?: (files: File[]) => Promise<Attachment[]>
  onBusyChange?: (busy: boolean) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  // 排序标识只属于本次编辑，不写入附件数据；重名、重复路径也能独立移动。
  const ids = useRef(new WeakMap<Attachment, string>())
  const idOf = (attachment: Attachment) => {
    if (!ids.current.has(attachment)) ids.current.set(attachment, crypto.randomUUID())
    return ids.current.get(attachment)!
  }
  const itemIds = attachments.map(idOf)
  const active = attachments.find((attachment) => idOf(attachment) === activeId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const move = (from: number, to: number) => {
    if (from === to) return
    onChange(arrayMove(attachments, from, to))
    setNotice(`已将「${attachments[from]!.name || '未命名附件'}」移至第 ${to + 1} 位`)
  }
  const update = (index: number, patch: Partial<Attachment>) => {
    const previous = attachments[index]!
    const next = { ...previous, ...patch }
    ids.current.set(next, idOf(previous))
    onChange(attachments.map((attachment, i) => (i === index ? next : attachment)))
  }
  return (
    <fieldset disabled={busy} className="space-y-4">
      <div className="dg-attachment-caption">
        <span>{attachments.length ? `${attachments.length} 个附件` : '附件'}</span>
        <span>拖动调整顺序，点击名称编辑</span>
      </div>
      {attachments.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500">
          照片、截图或文件，都可以和这段记录放在一起。
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={({ active, over }) => {
          if (over) move(itemIds.indexOf(String(active.id)), itemIds.indexOf(String(over.id)))
          setActiveId(null)
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable: '按空格拿起附件，使用上下方向键调整顺序，再按空格放下，按 Escape 取消。',
          },
          announcements: {
            onDragStart: ({ active }) =>
              `已拿起第 ${itemIds.indexOf(String(active.id)) + 1} 个附件。`,
            onDragOver: ({ over }) =>
              over
                ? `移动至第 ${itemIds.indexOf(String(over.id)) + 1} 位。`
                : '移到附件列表中放下。',
            onDragEnd: ({ over }) =>
              over ? `已放到第 ${itemIds.indexOf(String(over.id)) + 1} 位。` : '未调整顺序。',
            onDragCancel: () => '已取消移动，顺序未变。',
          },
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="dg-attachment-list">
            {attachments.map((attachment, index) => (
              <AttachmentRow
                key={idOf(attachment)}
                id={idOf(attachment)}
                attachment={attachment}
                index={index}
                total={attachments.length}
                expanded={expanded === idOf(attachment)}
                onExpand={() =>
                  setExpanded(expanded === idOf(attachment) ? null : idOf(attachment))
                }
                onUpdate={(patch) => update(index, patch)}
                onMove={(to) => move(index, to)}
                onRemove={() => {
                  onChange(attachments.filter((_, i) => i !== index))
                  setNotice(`已移除「${attachment.name || '未命名附件'}」`)
                }}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {active && (
            <div className="dg-attachment-drag-preview">
              <GripVertical size={17} />
              <span>{active.name || '未命名附件'}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={mutedButtonClass}
          onClick={() => {
            const attachment: Attachment = { kind: 'file', name: '', path: null, meta: {} }
            setExpanded(idOf(attachment))
            onChange([...attachments, attachment])
          }}
        >
          <Link size={16} />
          添加附件引用
        </button>
        {onAddFiles && (
          <>
            <button
              type="button"
              disabled={busy}
              className={mutedButtonClass}
              onClick={() => picker.current?.click()}
            >
              <FilePlus2 size={16} />
              {busy ? '正在添加…' : '选择文件'}
            </button>
            <input
              ref={picker}
              hidden
              type="file"
              multiple
              onChange={async (event) => {
                const input = event.currentTarget
                const files = [...(input.files ?? [])]
                if (!files.length) return
                setBusy(true)
                onBusyChange?.(true)
                setError('')
                try {
                  onChange([...attachments, ...(await onAddFiles(files))])
                  setNotice(`已添加 ${files.length} 个附件`)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '附件添加失败，请重试。')
                } finally {
                  setBusy(false)
                  onBusyChange?.(false)
                  input.value = ''
                }
              }}
            />
          </>
        )}
      </div>
      <p role="status" className="min-h-5 text-xs text-[var(--dg-accent)]">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  )
}
