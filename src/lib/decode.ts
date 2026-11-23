import type { Post } from '@/types'

export const hookOf = (p: Post) => p.script?.hookType ?? p.digest?.hookType

export function decodeState(posts: Post[], current: string | undefined, startedAt: number) {
  const at = current ? posts.findIndex((p) => p.code === current) : -1
  const processed = at < 0 ? posts.length : at
  const done = posts.slice(0, processed).filter((p) => p.status === 'done' && p.digest)
  const last = Math.max(startedAt, ...done.map((p) => p.processedAt ?? 0))
  const perPost = processed && last > startedAt ? (last - startedAt) / processed : 0
  const hooks = new Map<string, number>()
  for (const p of done) {
    const h = hookOf(p)
    if (h) hooks.set(h, (hooks.get(h) ?? 0) + 1)
  }
  return {
    processed,
    decoded: done.length,
    points: done.reduce((n, p) => n + p.digest!.points.length, 0),
    etaMs: perPost ? perPost * (posts.length - processed) : undefined,
    hooks: [...hooks].sort((a, b) => b[1] - a[1]),
    latest: done.reduce<Post | undefined>((a, p) => (!a || (p.processedAt ?? 0) >= (a.processedAt ?? 0) ? p : a), undefined),
  }
}

export const WALL = 24
export const WALL_ROW = 8

export function windowStart(processed: number, total: number) {
  return Math.max(0, Math.min(Math.floor(processed / WALL_ROW) * WALL_ROW - WALL_ROW, total - WALL))
}
