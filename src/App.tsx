import { MoreHorizontal, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CreatorView } from '@/components/CreatorView'
import { ALL } from '@/components/TheoryDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Welcome } from '@/components/Welcome'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { LlmError } from '@/lib/llm'
import { processCreator, type Progress } from '@/lib/pipeline'
import { cn } from '@/lib/utils'
import { browserLang, resolveLang, setLang, t } from '@/lib/i18n'
import { deleteCreator, getCreators, getSettings, onStoreChange } from '@/lib/store'
import { useLang } from '@/lib/useLang'
import { buildPlaybook } from '@/lib/script'
import { buildTheory } from '@/lib/theory'
import type { Creator } from '@/types'

type Task = (c: Creator, signal: AbortSignal, onProgress: (p: Progress) => void) => Promise<void>

export interface Run {
  creator: string
  progress: Progress
  startedAt: number
}

export default function App() {
  const lang = useLang()
  useEffect(() => void (document.title = t('app.name')), [lang])
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Creator | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [stopped, setStopped] = useState<{ creator: string; reason: string } | null>(null)
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

  async function runTask(creator: Creator, task: Task, doneMsg: string) {
    if (run) return
    lastTask.current = { task, doneMsg }
    const ctrl = new AbortController()
    abort.current = ctrl
    setStopped(null)
    const startedAt = Date.now()
    setRun({ creator: creator.name, progress: { done: 0, total: 0, status: t('app.preparing') }, startedAt })
    try {
      await task(creator, ctrl.signal, (progress) => setRun({ creator: creator.name, progress, startedAt }))
      if (!ctrl.signal.aborted) toast.success(doneMsg)
    } catch (e) {
      if (ctrl.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg, { duration: 10000 })
      setStopped({ creator: creator.name, reason: msg })
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
    <div className="flex h-screen flex-col bg-background text-foreground md:flex-row">
      <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-b bg-sidebar text-sidebar-foreground md:max-h-none md:w-60 md:border-r md:border-b-0">
        <button className="flex h-12 items-center gap-2 px-3 text-left" onClick={() => setSelected(null)}>
          <img src="/icons/icon-48.png" alt="" className="size-6 rounded-md" />
          <span className="font-semibold text-foreground">{t('app.shortName')}</span>
        </button>
        <Separator />
        <p className="px-4 pt-4 pb-2 text-xs text-muted-foreground">{t('app.creators')}</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {creators.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">{t('app.noCreators')}</p>}
          {creators.map((c) => {
            const on = c.name === selected
            return (
              <div key={c.name} className={cn('group relative flex items-center rounded-md', on ? 'bg-accent' : 'hover:bg-accent/60')}>
                <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-sm"
                  aria-current={on ? 'page' : undefined} onClick={() => setSelected(c.name)}>
                  <span className={cn('truncate', on && 'font-medium')}>{c.name}</span>
                  <span className={cn('shrink-0 text-xs text-muted-foreground tabular-nums group-focus-within:invisible group-hover:invisible', on && 'invisible')}>
                    {c.codes.length}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={t('app.moreFor', { name: c.name })}
                      className={cn('absolute right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100', on && 'opacity-100')}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)} disabled={run?.creator === c.name}>
                      <Trash2 /> {t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon /> {t('app.settings')}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {current ? (
          <CreatorView
            key={current.name}
            creator={current}
            run={run}
            stopReason={stopped?.creator === current.name ? stopped.reason : undefined}
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
          <Welcome creators={creators} onSelect={setSelected} />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('app.deleteTitle', { name: toDelete?.name ?? '' })}</DialogTitle>
            <DialogDescription>
              {t('app.deleteDesc', { n: toDelete?.codes.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('common.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
