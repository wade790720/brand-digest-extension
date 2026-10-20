import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import { captureErrors } from '@/lib/error-log'
import { browserLang, resolveLang, setLang } from '@/lib/i18n'
import { getSettings } from '@/lib/store'

captureErrors('brand-digest')

// 跟著系統切換深色模式（shadcn 的主題用 .dark class）
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

// 先讀語言設定再畫面：App 一出現就要是使用者選的語言，不要先閃一下別的語言
getSettings().then((s) => {
  setLang(resolveLang(s.lang, browserLang()))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TooltipProvider>
        <App />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </StrictMode>,
  )
})
