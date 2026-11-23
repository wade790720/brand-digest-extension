import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import './index.css'
import App from './App.tsx'
import { captureErrors } from '@/lib/error-log'
import { browserLang, resolveLang, setLang } from '@/lib/i18n'
import { getSettings } from '@/lib/store'

captureErrors('brand-digest')

// 跟著系統切換深色模式（shadcn 的主題用 .dark class）
const dark = window.matchMedia('(prefers-color-scheme: dark)')
// 切換時先暫停轉場：不然所有有顏色轉場的元素會同時漸變，拖出殘影
const applyTheme = () => {
  const pause = document.createElement('style')
  pause.textContent = '*, *::before, *::after { transition: none !important }'
  document.head.append(pause)
  document.documentElement.classList.toggle('dark', dark.matches)
  void getComputedStyle(document.documentElement).color // 先套用新顏色，下一格畫面再恢復轉場
  requestAnimationFrame(() => pause.remove())
}
applyTheme()
dark.addEventListener('change', applyTheme)

// 先讀語言設定再畫面：App 一出現就要是使用者選的語言，不要先閃一下別的語言
getSettings().then((s) => {
  setLang(resolveLang(s.lang, browserLang()))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <Toaster richColors position="bottom-right" />
    </StrictMode>,
  )
})
