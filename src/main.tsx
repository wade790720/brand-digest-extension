import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import './index.css'
import App from './App.tsx'
import { captureErrors } from '@/lib/error-log'
import { browserLang, resolveLang, setLang } from '@/lib/i18n'
import { getSettings } from '@/lib/store'

captureErrors('brand-digest')

const dark = window.matchMedia('(prefers-color-scheme: dark)')
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

getSettings().then((s) => {
  setLang(resolveLang(s.lang, browserLang()))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <Toaster richColors position="bottom-right" />
    </StrictMode>,
  )
})
