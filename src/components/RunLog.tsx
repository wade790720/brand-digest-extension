import { Check, Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import type { LogEntry, Stopped } from '@/App'
import { Button } from '@/components/ui/button'
import { t, type Key } from '@/lib/i18n'
import type { Progress, Step } from '@/lib/pipeline'
import { cn } from '@/lib/utils'

const STEPS: Step[] = ['download', 'transcribe', 'extract']
const stepLabel = (s: Step) => t(`step.${s}` as Key)

/** 萃取中的精簡狀態列：第幾則，以及這則做到下載、轉錄、萃取的哪一步 */
export function StepRail({ progress }: { progress: Progress }) {
  const { step, done, total } = progress
  const now = step ? STEPS.indexOf(step) : -1
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="text-sm font-medium tabular-nums">
        {step === 'kb' ? stepLabel('kb') : t('pipe.label', { i: Math.min(done + 1, total), n: total })}
      </p>
      {step !== 'kb' && (
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === now ? 'step' : undefined}
              className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5',
                i === now ? 'border-primary font-medium text-foreground' : i < now ? 'text-foreground' : 'border-dashed text-muted-foreground')}>
              {i < now && <Check className="size-3" aria-hidden />}
              {i === now && <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />}
              {stepLabel(s)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function LogToggle({ log, startedAt }: { log: LogEntry[]; startedAt: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? t('log.hide') : t('log.show', { n: log.length })}
      </Button>
      {open && <RunLog log={log} startedAt={startedAt} />}
    </div>
  )
}

/** 停下時的說明：停在哪一則、哪一步、為什麼，停下前自動等了幾次，可以從這裡繼續 */
export function StopDetail({ stopped, onRetry, busy }: { stopped: Stopped; onRetry: () => void; busy: boolean }) {
  const { where, log } = stopped
  const waits = where?.code ? log.filter((e) => e.level === 'warn' && e.code === where.code).length : 0
  return (
    <section role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <p className="font-medium text-destructive">{t('cv.stopped')}</p>
      {where?.step && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
          {where.index ? t('stop.where', { i: where.index, step: stepLabel(where.step) }) : stepLabel(where.step)}
          {where.code && (
            <a className="font-normal text-[var(--primary-text)] underline-offset-4 hover:underline"
              href={`https://www.instagram.com/p/${where.code}/`} target="_blank" rel="noreferrer">{t('stop.post')}</a>
          )}
        </p>
      )}
      <p className="text-sm">{stopped.reason}</p>
      {waits > 0 && <p className="text-xs text-muted-foreground">{t('stop.waits', { n: waits })}</p>}
      <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}><Play /> {t('common.continue')}</Button>
      {log.length > 0 && <LogToggle log={log} startedAt={stopped.startedAt} />}
    </section>
  )
}

type Filter = 'all' | 'warn' | 'error'
const FILTERS: [Filter, Key][] = [['all', 'log.all'], ['warn', 'log.warn'], ['error', 'log.error']]
const LEVEL: Record<LogEntry['level'], Key> = { info: 'log.info', warn: 'log.warn', error: 'log.error' }

/** 這次執行的紀錄，新的在上面。時間是從開始算起的分:秒 */
export function RunLog({ log, startedAt }: { log: LogEntry[]; startedAt: number }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = log.map((e, i) => ({ ...e, i })).filter((e) => filter === 'all' || e.level === filter).reverse()
  const clock = (at: number) => {
    const s = Math.max(0, Math.round((at - startedAt) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label={t('log.title')} className="flex flex-wrap gap-1">
        {FILTERS.map(([f, label]) => (
          <Button key={f} size="xs" variant={filter === f ? 'secondary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(label)} <span className="tabular-nums text-muted-foreground">{f === 'all' ? log.length : log.filter((e) => e.level === f).length}</span>
          </Button>
        ))}
      </div>
      {shown.length ? (
        <ol className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border text-xs">
          {shown.map((e) => (
            <li key={e.i} className="grid grid-cols-[2.75rem_4rem_minmax(0,1fr)] gap-2 border-b px-3 py-1.5 last:border-b-0">
              <span className="text-muted-foreground tabular-nums">{clock(e.at)}</span>
              <span className={cn('font-medium', e.level === 'error' ? 'text-destructive' : e.level === 'warn' ? 'text-foreground' : 'text-muted-foreground')}>
                {t(LEVEL[e.level])}
              </span>
              <span className="break-words">{e.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">{t('log.empty')}</p>
      )}
    </div>
  )
}
