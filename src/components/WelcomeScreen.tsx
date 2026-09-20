import { ArrowUpRight, BookOpen, FileText, FolderOpen, PenLine } from 'lucide-react'
import { useRef } from 'react'
import { filesFromInput } from '../data/pickSource'
import { useAppStore } from '../model/store'

export function WelcomeScreen({
  reason,
}: {
  reason: 'file-protocol' | 'not-found' | 'network' | null
}) {
  const openFiles = useAppStore((state) => state.openFiles)
  const openDirectory = useAppStore((state) => state.openDirectory)
  const openFile = useAppStore((state) => state.openFile)
  const newDocument = useAppStore((state) => state.newDocument)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-10 items-center justify-center rounded-xl bg-[var(--dg-accent-soft)] text-[var(--dg-accent)]">
            <BookOpen size={23} strokeWidth={1.6} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">
            Dialogary
          </span>
        </div>
        <h1 className="text-3xl font-medium leading-[1.5] tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-4xl">
          把对话，
          <br />
          留成自己的日记。
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-7 text-neutral-500 dark:text-neutral-400">
          收好那些聊过的日常、闪过的念头，
          <br className="hidden sm:block" />
          还有一点一点，走到今天的自己。
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <button type="button" onClick={newDocument} className="dg-primary !px-5 !py-3 !text-sm">
            <PenLine size={16} />
            开始一本新日记
          </button>
          <button
            type="button"
            onClick={() => {
              void openFile().then((handled) => {
                if (!handled) fileInput.current?.click()
              })
            }}
            className="flex items-center gap-2 rounded-xl bg-neutral-100 px-5 py-3 text-sm text-neutral-600 transition hover:bg-neutral-200/80 focus-visible:outline-2 focus-visible:outline-[var(--dg-accent)] dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <FileText size={16} />
            打开日记
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={() => {
              void openDirectory().then((handled) => {
                if (!handled) dirInput.current?.click()
              })
            }}
            className="flex items-center gap-2 rounded-lg py-2 text-xs text-neutral-500 transition hover:text-[var(--dg-accent)] focus-visible:outline-2 focus-visible:outline-[var(--dg-accent)] dark:text-neutral-400 dark:hover:text-[var(--dg-accent)]"
          >
            <FolderOpen size={15} />
            打开文件夹，连同照片一起
          </button>
          <a
            href="?demo"
            className="flex items-center gap-1 rounded-lg py-2 text-xs text-neutral-400 hover:text-[var(--dg-accent)]"
          >
            看看示例
            <ArrowUpRight size={13} />
          </a>
        </div>
        <p className="mt-10 text-xs leading-6 text-neutral-400 dark:text-neutral-500">
          也可以将 Markdown 文件或日记文件夹拖到这里。
          <br />
          记录保存在你的文件中，编辑时会在此浏览器保留草稿。
        </p>
        {reason === 'network' && (
          <p role="status" className="mt-4 text-xs leading-6 text-amber-700 dark:text-amber-400">
            上次的日记暂时无法读取。你仍然可以打开本地文件，或开始一篇新记录。
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".md,text/markdown"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void openFiles(filesFromInput(event.target.files))
            event.target.value = ''
          }}
        />
        <input
          ref={dirInput}
          type="file"
          // @ts-expect-error Chromium/WebKit 的目录选择属性。
          webkitdirectory=""
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void openFiles(filesFromInput(event.target.files))
            event.target.value = ''
          }}
        />
      </div>
    </main>
  )
}
