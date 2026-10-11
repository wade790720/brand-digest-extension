import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import { MembershipGate } from '@/components/MembershipGate'
import { captureErrors } from '@/lib/error-log'
import { ErrorReportingPrompt } from '@/components/ReportProblem'

captureErrors('brand-digest')

// 跟著系統切換深色模式（shadcn 的主題用 .dark class）
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <MembershipGate><App /></MembershipGate>
      <Toaster richColors position="bottom-right" />
      <ErrorReportingPrompt />
    </TooltipProvider>
  </StrictMode>,
)
