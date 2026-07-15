import { BookOpen, FileText, FolderOpen } from 'lucide-react'
import { useRef } from 'react'
import { filesFromInput } from '../data/pickSource'
import { useAppStore } from '../model/store'

export function WelcomeScreen({ reason }: { reason: 'file-protocol' | 'not-found' | 'network' | null }) {
  const openFiles = useAppStore((s) => s.openFiles)
  const openDirectory = useAppStore((s) => s.openDirectory)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/15">
        <BookOpen size={30} className="text-indigo-500 dark:text-indigo-300" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Dialogary</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-neutral-400 dark:text-neutral-500">
          chatlog-md 聊天日记查看器 — 打开你的 <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">*.chat.md</code>
          ，或直接把文件/文件夹拖进窗口
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm text-white transition-colors hover:bg-indigo-600 dark:bg-indigo-500/85 dark:hover:bg-indigo-500"
        >
          <FileText size={16} />
          打开文件
        </button>
        <button
          type="button"
          onClick={() => {
            void openDirectory().then((handled) => {
              if (!handled) dirInput.current?.click()
            })
          }}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
        >
          <FolderOpen size={16} />
          打开文件夹（含图片）
        </button>
      </div>

      {reason === 'file-protocol' && (
        <p className="max-w-md rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          当前通过 file:// 直接打开页面，浏览器不允许自动读取数据文件。可以手动打开文件，或用静态服务器访问（如在 dist
          目录旁执行 <code>npx serve</code>）。
        </p>
      )}
      {reason !== 'file-protocol' && (
        <p className="max-w-md text-xs leading-relaxed text-neutral-400 dark:text-neutral-600">
          部署提示：把 *.chat.md 和 assets/ 放进应用的 data/ 目录即可自动加载（开发时为 public/data/）。
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".md,text/markdown"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void openFiles(filesFromInput(e.target.files))
          e.target.value = ''
        }}
      />
      <input
        ref={dirInput}
        type="file"
        // @ts-expect-error 非标准属性，Chromium/WebKit 支持
        webkitdirectory=""
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void openFiles(filesFromInput(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
