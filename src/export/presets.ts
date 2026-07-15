import type { ExportTemplate } from './template'

export interface Preset {
  id: string
  name: string
  template: ExportTemplate
}

export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: '默认',
    template: {
      sessionHeading: '',
      separator: '',
      user: {
        include: true,
        header: '# 🧑‍💻 User Prompt',
        metaLines: '> 时间：{time}',
        includeThinking: false,
        includeAttachments: true,
      },
      ai: {
        include: true,
        header: '# 🤖 AI Response',
        metaLines: '> 时间：{time}',
        includeThinking: false,
        includeAttachments: false,
      },
    },
  },
  {
    id: 'user-only',
    name: '纯用户消息（日记体）',
    template: {
      sessionHeading: '## {date} {weekday} {title}',
      separator: '',
      user: {
        include: true,
        header: '',
        metaLines: '',
        includeThinking: false,
        includeAttachments: false,
      },
      ai: {
        include: false,
        header: '',
        metaLines: '',
        includeThinking: false,
        includeAttachments: false,
      },
    },
  },
  {
    id: 'qa',
    name: '极简问答',
    template: {
      sessionHeading: '',
      separator: '---',
      user: {
        include: true,
        header: '**Q：**',
        metaLines: '',
        includeThinking: false,
        includeAttachments: false,
      },
      ai: {
        include: true,
        header: '**A：**',
        metaLines: '',
        includeThinking: false,
        includeAttachments: false,
      },
    },
  },
  {
    id: 'full',
    name: '完整版（含思考与模型）',
    template: {
      sessionHeading: '# {date} · {weekday} · {title}',
      separator: '',
      user: {
        include: true,
        header: '## 🧑‍💻 User Prompt',
        metaLines: '> 时间：{time}',
        includeThinking: false,
        includeAttachments: true,
      },
      ai: {
        include: true,
        header: '## 🤖 AI Response',
        metaLines: '> 时间：{time}\n> 模型：{model}',
        includeThinking: true,
        includeAttachments: true,
      },
    },
  },
]

const STORAGE_KEY = 'dialogary-export-template'

export function loadSavedTemplate(): ExportTemplate | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExportTemplate
    if (parsed && parsed.user && parsed.ai) return parsed
  } catch {
    // 忽略损坏的存档
  }
  return null
}

export function saveTemplate(template: ExportTemplate): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(template))
  } catch {
    // 存储不可用时静默失败
  }
}
