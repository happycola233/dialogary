import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'

const DATA_DIR = path.resolve(import.meta.dirname, 'public/data')

function scanChatFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) return []
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.chat.md'))
    .sort()
}

/**
 * 数据清单插件：public/data/ 下的 *.chat.md 由 Vite 原样服务/打包，
 * 这里额外合成 /data/manifest.json，让前端不必猜文件名（中文文件名尤其如此）。
 */
function chatDataManifest(): Plugin {
  const serveManifest = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/data/manifest.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ files: scanChatFiles() }))
    })
  }
  return {
    name: 'chat-data-manifest',
    configureServer: serveManifest,
    configurePreviewServer: serveManifest,
    closeBundle() {
      const files = scanChatFiles()
      if (files.length === 0) return
      const outDir = path.resolve(import.meta.dirname, 'dist/data')
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ files }), 'utf8')
    },
  }
}

export default defineConfig({
  // 相对路径构建：dist 可放在任意子目录/静态服务器下直接工作
  base: './',
  plugins: [react(), tailwindcss(), chatDataManifest()],
  server: {
    host: true, // 允许手机通过局域网 IP 访问 dev 服务器
    port: 5173,
  },
})
