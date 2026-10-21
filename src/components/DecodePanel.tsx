import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { WALL, decodeState, hookOf, windowStart } from '@/lib/decode'
import { getLang, hookTypeLabel, t, valueLabel } from '@/lib/i18n'
import { HOOK_TYPES } from '@/lib/prompts'
import { cn } from '@/lib/utils'
import type { Post } from '@/types'

const VALUE = { 高: 'default', 中: 'secondary', 低: 'outline' } as const

/** 每則固定一個深淺的主色色塊：沒有縮圖、或縮圖下載失敗時顯示 */
const shade = (code: string) => 45 + ([...code].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0) % 50

function Thumb({ post, lit, className }: { post: Post; lit: boolean; className?: string }) {
  const [broken, setBroken] = useState(false)
  const base = cn('object-cover motion-safe:transition-[opacity,filter,background-color] motion-safe:duration-500', className)
  if (post.thumb && !broken)
    return <img src={post.thumb} alt="" onError={() => setBroken(true)} className={cn(base, !lit && 'opacity-30 grayscale')} />
  return <div className={cn(base, 'bg-muted')} style={lit ? { background: `color-mix(in oklab, var(--primary) ${shade(post.code)}%, var(--muted))` } : undefined} />
}

/** 萃取時的拆解畫面，進行中是整頁的主角。資料怎麼來的不管：萃取中是真的進度，重播是用存好的結果一則一則放 */
export function DecodePanel({ handle, posts, current, startedAt, live = true, note, children }: {
  handle: string
  posts: Post[] // 這次要處理的貼文，依處理順序
  current?: string // 正在處理的那則
  startedAt: number
  live?: boolean // 重播時關掉：一秒好幾則，每則都念會吵
  note?: ReactNode // 最下面的小字
  children?: ReactNode // 標題右邊的東西（重播的控制）
}) {
  const s = decodeState(posts, current, startedAt)
  const num = new Intl.NumberFormat(getLang(), { notation: 'compact' })
  const eta = s.processed === posts.length ? '—'
    : s.etaMs === undefined ? t('decode.etaUnknown')
    : s.etaMs < 60_000 ? t('decode.etaSoon') : t('decode.etaMin', { n: Math.round(s.etaMs / 60_000) })
  const d = s.latest?.digest
  const quote = d && (d.quotes[0] ?? d.points[0] ?? d.topic)
  const hook = s.latest && hookOf(s.latest)
  // 縮圖牆只放一段，一次往下捲一列
  const start = windowStart(s.processed, posts.length)
  const wall = posts.slice(start, start + WALL)
  // 開場類型固定順序全部列出，從 0 開始往上加，格子不會跳位
  const hooks = new Map(s.hooks)
  const top = s.hooks[0]?.[0]

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-bold tracking-tight">{t('decode.title', { handle })}</h2>
        {children}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {([[t('decode.decoded'), `${s.decoded}/${posts.length}`], [t('decode.points'), s.points], [t('decode.eta'), eta]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg border px-4 py-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        {/* 縮圖牆：處理過的亮起來，正在處理的有外框。數字已在上面，螢幕閱讀器略過這塊 */}
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
          <div key={s.latest.code} className="essence-card space-y-3">
            <Thumb post={s.latest} lit className="aspect-[3/4] w-full rounded-xl" />
            <p className="text-xs text-muted-foreground">{t('decode.latest')}</p>
            <blockquote className="line-clamp-4 border-l-2 border-primary pl-3 text-lg font-medium leading-snug">{quote}</blockquote>
            <div className="flex flex-wrap gap-1.5">
              {quote !== d.topic && <Badge variant="outline" className="max-w-full truncate">{d.topic}</Badge>}
              <Badge variant={VALUE[d.value]}>{t('cv.value', { v: valueLabel(d.value) })}</Badge>
              {hook && <Badge variant="secondary">{hookTypeLabel(hook)}</Badge>}
              {s.latest.stats?.plays !== undefined && <Badge variant="outline">{t('decode.plays', { n: num.format(s.latest.stats.plays) })}</Badge>}
              {s.latest.stats?.likes !== undefined && <Badge variant="outline">{t('decode.likes', { n: num.format(s.latest.stats.likes) })}</Badge>}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('decode.waiting')}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('decode.hooks')}</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {HOOK_TYPES.map((h) => {
            const n = hooks.get(h) ?? 0
            return (
              <li key={h} className={cn('rounded-lg border px-2 py-2 text-center', h === top && 'border-primary', !n && 'opacity-50')}>
                <p className={cn('text-2xl font-semibold tabular-nums', h === top && 'text-[var(--primary-text)]')}>{n}</p>
                <p className="truncate text-xs text-muted-foreground">{hookTypeLabel(h)}</p>
              </li>
            )
          })}
        </ul>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {/* 只在每完成一則時念一次：文字只跟著「最新完成的那則」變 */}
      {live && (
        <p className="sr-only" aria-live="polite">
          {s.latest && d ? t('decode.announce', { n: s.decoded, total: posts.length, topic: d.topic }) : ''}
        </p>
      )}
    </section>
  )
}
