import { ExternalLink, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLang, hookTypeLabel, t } from '@/lib/i18n'
import { CLASSROOM_URL, CLUB_URL } from '@/lib/links'
import { hookStats } from '@/lib/script'
import { teachLine } from '@/lib/tasks'
import type { KnowledgeBase, Post } from '@/types'

const FEW = 5 // ponytail: 少於 5 則的平均很容易被一支爆紅影片拉高，只標示不隱藏

/** 知識庫最上面的一頁總覽：在教什麼、幾個數字、最常用的開場，底部是下一步和俱樂部 */
export function KbDashboard({ kb, posts, actions, clubDismissed, onDismissClub }: {
  kb: KnowledgeBase
  posts: Post[]
  actions: { done: number; total: number }
  clubDismissed: boolean
  onDismissClub: () => void
}) {
  const done = posts.filter((p) => p.status === 'done' && p.digest)
  const num = new Intl.NumberFormat(getLang(), { notation: 'compact' })
  const hooks = hookStats(done).sort((a, b) => b.count - a.count).slice(0, 3)
  const teach = teachLine(kb.markdown)
  const stats = [
    [t('dash.analyzed'), done.length],
    [t('dash.points'), done.reduce((n, p) => n + p.digest!.points.length, 0)],
    [t('dash.actions'), `${actions.done}/${actions.total}`],
  ] as const

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      {teach && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('dash.teaches')}</p>
          <p className="text-lg font-medium leading-snug">{teach}</p>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('dash.hooks')}</p>
        {hooks.length ? (
          <ol className="space-y-1.5 text-sm">
            {hooks.map((h, i) => (
              <li key={h.type} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-medium">{hookTypeLabel(h.type)}</span>
                <span className="text-muted-foreground tabular-nums">{t('dash.hookCount', { n: h.count })}</span>
                {h.plays !== undefined && <span className="text-muted-foreground tabular-nums">{t('dash.avgPlays', { n: num.format(h.plays) })}</span>}
                {h.likes !== undefined && <span className="text-muted-foreground tabular-nums">{t('dash.avgLikes', { n: num.format(h.likes) })}</span>}
                {h.count < FEW && <Badge variant="outline">{t('dash.fewSamples')}</Badge>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dash.noHooks')}</p>
        )}
      </div>

      {/* 原本是兩條各自的提示（俱樂部、下一步），併成儀表板底部一列 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm">
        <a href={CLASSROOM_URL} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[var(--primary-text)] underline-offset-4 hover:underline">
          {t('cv.nextStep')}
        </a>
        {!clubDismissed && (
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" asChild title={t('club.pitch')}>
              <a href={CLUB_URL} target="_blank" rel="noreferrer">{t('club.visit')} <ExternalLink /></a>
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label={t('club.dismiss')} onClick={onDismissClub}><X /></Button>
          </span>
        )}
      </div>
    </section>
  )
}
