import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import { MembershipGate } from '@/components/MembershipGate'
import { captureErrors } from '@/lib/error-log'
import { browserLang, resolveLang, setLang } from '@/lib/i18n'
import { getSettings } from '@/lib/store'
import { useLang } from '@/lib/useLang'

captureErrors('brand-digest')

// 跟著系統切換深色模式（shadcn 的主題用 .dark class）
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

// 會員檢查畫面在 App 之前出現：先讀語言設定，它才會跟著使用者選的語言
function Root() {
  const lang = useLang()
  return <MembershipGate lang={lang === 'en' ? 'en' : 'zh'}><App /></MembershipGate>
}

getSettings().then((s) => {
  setLang(resolveLang(s.lang, browserLang()))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TooltipProvider>
        <Root />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </StrictMode>,
  )
})
