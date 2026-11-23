import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { FEED, WALL, decodeState, hookOf, windowStart } from '@/lib/decode'
import { getLang, hookTypeLabel, t, valueLabel } from '@/lib/i18n'
import { HOOK_TYPES } from '@/lib/prompts'
import { cn } from '@/lib/utils'
import type { Post } from '@/types'

const VALUE = { 高: 'default', 中: 'secondary', 低: 'outline' } as const

const shade = (code: string) => 10 + ([...code].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0) % 16

function Thumb({ post, lit, className }: { post: Post; lit: boolean; className?: string }) {
  const [broken, setBroken] = useState(false)
  const base = cn('object-cover motion-safe:transition-[opacity,filter,background-color] motion-safe:duration-500', className)
  if (post.thumb && !broken)
    return <img src={post.thumb} alt="" onError={() => setBroken(true)} className={cn(base, 'outline -outline-offset-1 outline-black/10 dark:outline-white/10', !lit && 'opacity-30 grayscale')} />
  return <div className={cn(base, 'bg-muted')} style={lit ? { background: `color-mix(in oklab, var(--foreground) ${shade(post.code)}%, var(--muted))` } : undefined} />
}

/** 新的一則從上面推進來。列高固定，動畫開始時畫面和上一刻完全相同 */
function Feed({ posts }: { posts: Post[] }) {
  if (!posts.length) return null
  return (
    <div className="min-w-0 space-y-2 md:col-start-1 md:row-start-2">
      <p className="text-sm font-medium">{t('decode.recent')}</p>
      <div className="tile overflow-hidden rounded-xl" style={{ height: `calc(${Math.min(posts.length, FEED) * 3.5}rem + 2px)` }}>
        <ol key={posts[0].code} className="feed-shift">
          {posts.map((p, i) => {
            const hook = hookOf(p)
            return (
              <li key={p.code} aria-hidden={i >= FEED || undefined} className="flex h-14 items-center gap-3 border-t px-2 first:border-t-0">
                <Thumb post={p} lit className="size-10 shrink-0 rounded-[calc(var(--radius-xl)-0.5rem-1px)]" />
                <p className="min-w-0 flex-1 truncate text-sm" title={p.digest!.topic}>{p.digest!.topic}</p>
                {hook && <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">{hookTypeLabel(hook)}</Badge>}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export function DecodePanel({ handle, posts, current, startedAt, live = true, note, children }: {
  handle: string
  posts: Post[]
  current?: string
  startedAt: number
  live?: boolean
  note?: ReactNode
  children?: ReactNode
}) {
  const s = decodeState(posts, current, startedAt)
  const num = new Intl.NumberFormat(getLang(), { notation: 'compact' })
  const eta = s.processed === posts.length ? '—'
    : s.etaMs === undefined ? t('decode.etaUnknown')
    : s.etaMs < 60_000 ? t('decode.etaSoon') : t('decode.etaMin', { n: Math.round(s.etaMs / 60_000) })
  const d = s.latest?.digest
  const quote = d && (d.quotes[0] ?? d.points[0] ?? d.topic)
  const hook = s.latest && hookOf(s.latest)
  const start = windowStart(s.processed, posts.length)
  const wall = posts.slice(start, start + WALL)
  const hooks = new Map(s.hooks)
  const top = s.hooks[0]?.[0]

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold">{t('decode.title', { handle })}</h2>
        {children}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {([[t('decode.decoded'), `${s.decoded}/${posts.length}`], [t('decode.points'), s.points], [t('decode.eta'), eta]] as const).map(([k, v]) => (
          <div key={k} className="tile rounded-xl px-4 py-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem] md:grid-rows-[auto_1fr]">
        <div className="space-y-2" aria-hidden>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {wall.map((p, k) => {
              const i = start + k
              return (
                <div key={p.code} className={cn('relative rounded-md', p.code === current && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
                  <Thumb post={p} lit={i < s.processed && p.status === 'done'} className="aspect-[9/16] w-full rounded-md" />
                  {i < s.processed && p.status === 'error' && <span className="absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-destructive" />}
                </div>
              )
            })}
          </div>
          {posts.length > WALL && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('decode.window', { from: start + 1, to: start + wall.length, n: posts.length })}
            </p>
          )}
        </div>

        {s.latest && d ? (
          <div key={s.latest.code} className="essence-card space-y-3 md:col-start-2 md:row-span-2 md:row-start-1">
            <Thumb post={s.latest} lit className="aspect-[3/4] w-full rounded-xl" />
            <p className="text-xs text-muted-foreground">{t('decode.latest')}</p>
            <blockquote className="line-clamp-4 border-l-2 border-[var(--tone-key)] pl-3 text-lg font-medium leading-snug">{quote}</blockquote>
            <div className="flex flex-wrap gap-1.5">
              {quote !== d.topic && <Badge variant="outline" className="max-w-full truncate">{d.topic}</Badge>}
              <Badge variant={VALUE[d.value]}>{t('cv.value', { v: valueLabel(d.value) })}</Badge>
              {hook && <Badge variant="secondary">{hookTypeLabel(hook)}</Badge>}
              {s.latest.stats?.plays !== undefined && <Badge variant="outline">{t('decode.plays', { n: num.format(s.latest.stats.plays) })}</Badge>}
              {s.latest.stats?.likes !== undefined && <Badge variant="outline">{t('decode.likes', { n: num.format(s.latest.stats.likes) })}</Badge>}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center self-start rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-muted-foreground md:col-start-2 md:row-span-2 md:row-start-1">
            {t('decode.waiting')}
          </div>
        )}
        <Feed posts={s.recent} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('decode.hooks')}</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {HOOK_TYPES.map((h) => {
            const n = hooks.get(h) ?? 0
            return (
              <li key={h} className={cn('tile rounded-xl px-2 py-2 text-center', h === top && 'bg-[color-mix(in_oklab,var(--tone-key)_16%,var(--card))]!')}>
                <p className={cn('text-2xl font-semibold tabular-nums', h === top && 'text-[var(--tone-key-text)]')}>{n}</p>
                <p className={cn('truncate text-xs', h === top ? 'text-foreground' : 'text-muted-foreground')}>{hookTypeLabel(h)}</p>
              </li>
            )
          })}
        </ul>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {live && (
        <p className="sr-only" aria-live="polite">
          {s.latest && d ? t('decode.announce', { n: s.decoded, total: posts.length, topic: d.topic }) : ''}
        </p>
      )}
    </section>
  )
}
