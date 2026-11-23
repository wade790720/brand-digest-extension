import { ArrowUpRightFromSquare, Bulb, Xmark } from '@gravity-ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLang, hookTypeLabel, t } from '@/lib/i18n'
import { CLASSROOM_URL, CLUB_URL } from '@/lib/links'
import { hookStats } from '@/lib/script'
import { teachLine } from '@/lib/tasks'
import type { KnowledgeBase, Post } from '@/types'

const FEW = 5 // ponytail: 少於 5 則的平均很容易被一支爆紅影片拉高，只標示不隱藏

export function KbDashboard({ kb, posts, clubDismissed, onDismissClub }: {
  kb: KnowledgeBase
  posts: Post[]
  clubDismissed: boolean
  onDismissClub: () => void
}) {
  const done = posts.filter((p) => p.status === 'done' && p.digest)
  const num = new Intl.NumberFormat(getLang(), { notation: 'compact' })
  const hooks = hookStats(done).sort((a, b) => b.count - a.count).slice(0, 3)
  const most = hooks[0]?.count ?? 1
  const teach = teachLine(kb.markdown)

  return (
    <section className="tile space-y-5 rounded-xl p-5">
      {teach && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--tone-key-text)]"><Bulb className="size-3.5" aria-hidden />{t('dash.teaches')}</p>
          <p className="text-xl leading-snug font-semibold text-balance">{teach}</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">{t('dash.hooks')}</p>
        {hooks.length ? (
          <ol className="space-y-3">
            {hooks.map((h, i) => (
              <li key={h.type} className="grid grid-cols-[1rem_minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate text-sm font-medium" title={hookTypeLabel(h.type)}>{hookTypeLabel(h.type)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-row-hover" aria-hidden>
                  <span className="block h-full rounded-full bg-[var(--tone-key)]" style={{ width: `${Math.round((h.count / most) * 100)}%` }} />
                </span>
                <span className="text-xs font-medium tabular-nums">{t('dash.hookCount', { n: h.count })}</span>
                {(h.plays !== undefined || h.likes !== undefined || h.count < FEW) && (
                  <span className="col-span-2 col-start-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums max-sm:col-span-3 max-sm:col-start-2">
                    {h.plays !== undefined && <span>{t('dash.avgPlays', { n: num.format(h.plays) })}</span>}
                    {h.likes !== undefined && <span>{t('dash.avgLikes', { n: num.format(h.likes) })}</span>}
                    {h.count < FEW && <Badge variant="outline">{t('dash.fewSamples')}</Badge>}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dash.noHooks')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm">
        <a href={CLASSROOM_URL} target="_blank" rel="noreferrer" className="min-w-0 flex-1 font-medium underline underline-offset-4">
          {t('cv.nextStep')}
        </a>
        {!clubDismissed && (
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" asChild data-icon="end" title={t('club.pitch')}>
              <a href={CLUB_URL} target="_blank" rel="noreferrer">{t('club.visit')}<ArrowUpRightFromSquare /></a>
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label={t('club.dismiss')} onClick={onDismissClub}><Xmark /></Button>
          </span>
        )}
      </div>
    </section>
  )
}
