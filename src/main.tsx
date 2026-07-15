import { createRoot } from 'react-dom/client'
import App from './App'
import { initAppearance } from './lib/appearance'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import './index.css'

// 渲染前应用外观偏好（气泡色/宽度/字号），避免首屏样式跳动
initAppearance()

createRoot(document.getElementById('root')!).render(<App />)
