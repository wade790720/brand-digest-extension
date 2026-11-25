import { Gear } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CreatorSwitcher } from '@/components/CreatorSwitcher'
import { CreatorView } from '@/components/CreatorView'
import { ALL } from '@/components/TheoryDialog'
import { SettingsView } from '@/components/SettingsView'
import { Welcome } from '@/components/Welcome'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { LlmError } from '@/lib/llm'
import { processCreator, type Progress, type RunEvent, type Step } from '@/lib/pipeline'
import { cn } from '@/lib/utils'
import { browserLang, resolveLang, setLang, t } from '@/lib/i18n'
import { deleteCreator, getCreators, getSettings, onStoreChange } from '@/lib/store'
import { useLang } from '@/lib/useLang'
import { buildPlaybook } from '@/lib/script'
import { buildTheory } from '@/lib/theory'
import type { Creator } from '@/types'

type Task = (c: Creator, signal: AbortSignal, onProgress: (p: Progress) => void) => Promise<void>

export interface LogEntry extends RunEvent {
  at: number
}

export interface Run {
  creator: string
  progress: Progress
  startedAt: number
  log: LogEntry[]
}

/** 上次為什麼停下、停在哪裡，連同這次的執行紀錄 */
export interface Stopped {
  creator: string
  reason: string
  startedAt: number
  log: LogEntry[]
  where?: { step?: Step; index?: number; code?: string }
  /** 額度或忙碌造成的暫停，不是錯誤 */
  waiting?: boolean
}

export default function App() {
  const lang = useLang()
  useEffect(() => void (document.title = t('app.name')), [lang])
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Creator | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [stopped, setStopped] = useState<Stopped | null>(null)
  const [tabsSlot, setTabsSlot] = useState<HTMLDivElement | null>(null)
  const abort = useRef<AbortController | null>(null)
  const lastTask = useRef<{ task: Task; doneMsg: string } | null>(null)

  const reload = useCallback(() => Promise.all([getCreators(), getSettings()]).then(([list, s]) => {
    setCreators(list)
    setLang(resolveLang(s.lang, browserLang()))
  }), [])
  useEffect(() => {
    reload()
    let timer: ReturnType<typeof setTimeout>
    return onStoreChange(() => (clearTimeout(timer), (timer = setTimeout(reload, 400))))
  }, [reload])

  useEffect(() => {
    if (!run) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [run])

  const current = creators.find((c) => c.name === selected)
  const go = (name: string | null) => (setSelected(name), setSettingsOpen(false))

  async function runTask(creator: Creator, task: Task, doneMsg: string) {
    if (run) return
    lastTask.current = { task, doneMsg }
    const ctrl = new AbortController()
    abort.current = ctrl
    setStopped(null)
    const startedAt = Date.now()
    // 紀錄和最後一次進度放在這裡累積：停下時直接讀，不受 state 更新時機影響
    let log: LogEntry[] = []
    let last: Progress = { done: 0, total: 0, status: t('app.preparing') }
    // 萃取失敗後還會先整合知識庫才停，停在哪一則要記失敗當下，不是最後一次進度
    let step: Step | undefined
    let failed: { text: string; where: NonNullable<Stopped['where']> } | undefined
    setRun({ creator: creator.name, progress: last, startedAt, log })
    try {
      await task(creator, ctrl.signal, (progress) => {
        if (progress.event) log = [...log, { ...progress.event, at: Date.now() }]
        last = progress
        if (progress.step) step = progress.step
        if (progress.event && progress.event.level !== 'info' && !progress.step && step)
          failed = { text: progress.event.text, where: { step, index: progress.done, ...(progress.event.code && { code: progress.event.code }) } }
        setRun({ creator: creator.name, progress, startedAt, log })
      })
      if (!ctrl.signal.aborted) toast.success(doneMsg)
    } catch (e) {
      if (ctrl.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      const waiting = e instanceof LlmError && e.isWait
      if (waiting) toast(msg, { duration: 10000 })
      else toast.error(msg, { duration: 10000 })
      if (failed?.text !== msg) log = [...log, { level: waiting ? 'warn' : 'error', text: msg, code: last.current, at: Date.now() }]
      const where = failed?.text === msg ? failed.where : last.step && { step: last.step, ...(last.current && { index: last.done + 1, code: last.current }) }
      setStopped({ creator: creator.name, reason: msg, startedAt, log, ...(where && { where }), ...(waiting && { waiting }) })
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'model')) setSettingsOpen(true)
    } finally {
      abort.current = null
      setRun(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    await deleteCreator(toDelete)
    if (selected === toDelete.name) setSelected(null)
    toast(t('app.deleted', { name: toDelete.name }))
    setToDelete(null)
    reload()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b bg-background">
        <div className="flex h-14 items-center gap-4 px-8 max-md:gap-2 max-md:px-4">
          <button className="flex shrink-0 items-center gap-2.5 rounded-md" onClick={() => go(null)}>
            <img src="/icons/icon-48.png" alt="" className="size-6 rounded-md" />
            <span className="text-sm font-semibold max-sm:sr-only">{t('app.shortName')}</span>
          </button>
          <span className="flex-1 max-md:hidden" />
          {creators.length > 0 && <CreatorSwitcher creators={creators} current={current?.name} onPick={go} />}
          <Button variant="ghost" size="icon" aria-label={t('app.settings')} title={t('app.settings')} aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn('shrink-0 text-text-secondary hover:text-foreground max-md:ml-auto', settingsOpen && 'bg-row-active text-foreground')}>
            <Gear />
          </Button>
        </div>
        <div ref={setTabsSlot} className={cn('px-8 max-md:px-4', settingsOpen && 'hidden')} />
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {settingsOpen ? (
          <SettingsView />
        ) : current ? (
          <CreatorView
            key={current.name}
            creator={current}
            tabsSlot={tabsSlot}
            run={run}
            stopped={stopped?.creator === current.name ? stopped : undefined}
            onDelete={() => setToDelete(current)}
            onRetry={() => lastTask.current && runTask(current, lastTask.current.task, lastTask.current.doneMsg)}
            onStart={(limit) => runTask(current, (c, signal, onProgress) => processCreator(c, signal, onProgress, limit),
              t('app.kbUpdated', { name: current.name }))}
            onTheory={(topic, sk) => runTask(current, (c, signal, onProgress) => buildTheory(c, topic, sk, signal, onProgress),
              t('app.theoryDone', { topic: topic === ALL ? t('theory.all') : topic }))}
            onScript={() => runTask(current, buildPlaybook, t('app.playbookDone', { name: current.name }))}
            onStop={() => abort.current?.abort()}
          />
        ) : (
          <Welcome creators={creators} onSelect={go} />
        )}
      </main>

      <StatusBar run={run} creators={creators} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">{t('app.deleteTitle', { name: toDelete?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('app.deleteDesc', { n: toDelete?.codes.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusBar({ run, creators }: { run: Run | null; creators: Creator[] }) {
  const p = run?.progress
  const text = p ? `${run!.creator} · ${p.status}` : t('app.statusIdle', { creators: creators.length, posts: creators.reduce((n, c) => n + c.codes.length, 0) })
  return (
    // 拆解畫面有自己的播報，這裡就不再念每一步
    <footer role="status" aria-live={p?.codes ? 'off' : 'polite'} className="flex min-h-9 shrink-0 items-center gap-3 border-t px-8 py-1.5 text-xs max-md:px-4">
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={text}>{text}</span>
      {p && (
        <span className="relative h-1 w-32 shrink-0 overflow-hidden rounded-full bg-muted max-sm:w-16" aria-hidden>
          {p.total
            ? <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
            : <span className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />}
        </span>
      )}
    </footer>
  )
}
