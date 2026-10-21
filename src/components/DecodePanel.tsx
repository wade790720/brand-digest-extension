import { Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { decodeState, hookOf } from '@/lib/decode'
import { getLang, hookTypeLabel, t, valueLabel } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Post } from '@/types'

const VALUE = { 高: 'default', 中: 'secondary', 低: 'outline' } as const

/** 每則固定一個深淺的主色色塊：沒有縮圖、或 IG 的縮圖網址過期時顯示 */
const shade = (code: string) => 45 + ([...code].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0) % 50

function Thumb({ post, lit, className }: { post: Post; lit: boolean; className?: string }) {
  const [broken, setBroken] = useState(false)
  const base = cn('rounded-sm object-cover motion-safe:transition-[opacity,filter,background-color] motion-safe:duration-500', className)
  if (post.thumb && !broken)
    return <img src={post.thumb} alt="" loading="lazy" onError={() => setBroken(true)} className={cn(base, !lit && 'opacity-30 grayscale')} />
  return <div className={cn(base, 'bg-muted')} style={lit ? { background: `color-mix(in oklab, var(--primary) ${shade(post.code)}%, var(--muted))` } : undefined} />
}

/** 萃取時的拆解畫面。資料怎麼來的不管：萃取中是真的進度，重播是用存好的結果一則一則放 */
export function DecodePanel({ handle, posts, current, startedAt, status, live = true, children }: {
  handle: string
  live?: boolean // 重播時關掉：一秒好幾則，每則都念會吵
  posts: Post[] // 這次要處理的貼文，依處理順序
  current?: string // 正在處理的那則
  startedAt: number
  status: string
  children?: ReactNode // 標題右邊的東西（重播的控制）
}) {
  const s = decodeState(posts, current, startedAt)
  const num = new Intl.NumberFormat(getLang(), { notation: 'compact' })
  const eta = s.processed === posts.length ? '—'
    : s.etaMs === undefined ? t('decode.etaUnknown')
    : s.etaMs < 60_000 ? t('decode.etaSoon') : t('decode.etaMin', { n: Math.round(s.etaMs / 60_000) })
  const max = s.hooks[0]?.[1] ?? 1
  const d = s.latest?.digest
  const quote = d && (d.quotes[0] ?? d.points[0] ?? d.topic)
  const hook = s.latest && hookOf(s.latest)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('decode.title', { handle })}</h2>
        {children}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {([[t('decode.decoded'), `${s.decoded}/${posts.length}`], [t('decode.points'), s.points], [t('decode.eta'), eta]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {/* 縮圖牆：處理過的亮起來，正在處理的有外框。數字已在上面，螢幕閱讀器略過這塊 */}
      <div aria-hidden className="grid grid-cols-[repeat(auto-fill,minmax(1.5rem,1fr))] gap-1">
        {posts.map((p, i) => (
          <div key={p.code} className={cn('relative rounded-sm', p.code === current && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}>
            <Thumb post={p} lit={i < s.processed && p.status === 'done'} className="aspect-[3/4] w-full" />
            {i < s.processed && p.status === 'error' && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-destructive" />}
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        {s.latest && d ? (
          <div key={s.latest.code} className="essence-card flex gap-4 rounded-xl border bg-card p-4">
            <Thumb post={s.latest} lit className="aspect-[3/4] w-20 shrink-0 self-start rounded-md" />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{t('decode.latest')}</p>
              <blockquote className="line-clamp-3 border-l-2 border-primary pl-3 font-medium">{quote}</blockquote>
              <div className="flex flex-wrap gap-1.5">
                {quote !== d.topic && <Badge variant="outline" className="max-w-full truncate">{d.topic}</Badge>}
                <Badge variant={VALUE[d.value]}>{t('cv.value', { v: valueLabel(d.value) })}</Badge>
                {hook && <Badge variant="secondary">{hookTypeLabel(hook)}</Badge>}
                {s.latest.stats?.plays !== undefined && <Badge variant="outline">{t('decode.plays', { n: num.format(s.latest.stats.plays) })}</Badge>}
                {s.latest.stats?.likes !== undefined && <Badge variant="outline">{t('decode.likes', { n: num.format(s.latest.stats.likes) })}</Badge>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t('decode.waiting')}</div>
        )}

        <div className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">{t('decode.hooks')}</p>
          {s.hooks.length ? (
            <ul className="space-y-1.5">
              {s.hooks.map(([h, n]) => (
                <li key={h} className="grid grid-cols-[5.5rem_1fr_3ch] items-center gap-2 text-xs">
                  <span className="truncate">{hookTypeLabel(h)}</span>
                  <span className="h-1.5 rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('decode.noHooks')}</p>
          )}
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {(live || s.processed < posts.length) && <Loader2 className="size-4 motion-safe:animate-spin" />} {status}
      </p>
      {/* 只在每完成一則時念一次：文字只跟著「最新完成的那則」變 */}
      {live && (
        <p className="sr-only" aria-live="polite">
          {s.latest && d ? t('decode.announce', { n: s.decoded, total: posts.length, topic: d.topic }) : ''}
        </p>
      )}
    </section>
  )
}
