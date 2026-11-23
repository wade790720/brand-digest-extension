import { getLang, t } from '@/lib/i18n'

function Stat({ label, value, of }: { label: string; value: number; of?: number }) {
  const num = new Intl.NumberFormat(getLang())
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl leading-8 font-semibold tabular-nums">
        {num.format(value)}
        {of !== undefined && <span className="ms-1 text-sm font-normal text-muted-foreground">/ {num.format(of)}</span>}
      </dd>
      {of !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-row-active" aria-hidden>
          <div className="h-full rounded-full bg-[var(--tone-action)]" style={{ width: `${of ? Math.round((value / of) * 100) : 0}%` }} />
        </div>
      )}
    </div>
  )
}

export function CreatorStats({ collected, done, points, actions }: {
  collected: number
  done: number
  points: number
  actions: { done: number; total: number }
}) {
  return (
    <dl className="grid min-w-[min(100%,20rem)] flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <Stat label={t('cv.statCollected')} value={collected} />
      <Stat label={t('cv.statDone')} value={done} of={collected} />
      <Stat label={t('dash.points')} value={points} />
      <Stat label={t('dash.actions')} value={actions.done} of={actions.total} />
    </dl>
  )
}
