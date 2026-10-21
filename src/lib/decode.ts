import type { Post } from '@/types'

/** 開場類型：萃取時判斷的優先，舊資料用腳本拆解的 */
export const hookOf = (p: Post) => p.digest?.hookType ?? p.script?.hookType

/** 拆解畫面的數字。posts 是這次要處理的貼文（依處理順序），current 是正在處理的那則；沒有＝都處理過了。
 *  只看資料算，不讀時鐘：預估剩餘時間用「最後一則完成的時間」推算，所以重播也能用同一套 */
export function decodeState(posts: Post[], current: string | undefined, startedAt: number) {
  const at = current ? posts.findIndex((p) => p.code === current) : -1
  const processed = at < 0 ? posts.length : at // 排在 current 前面的都處理過了（成功或失敗）
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
    etaMs: perPost ? perPost * (posts.length - processed) : undefined, // 還沒有任何一則完成就不估
    hooks: [...hooks].sort((a, b) => b[1] - a[1]),
    latest: done.reduce<Post | undefined>((a, p) => (!a || (p.processedAt ?? 0) >= (a.processedAt ?? 0) ? p : a), undefined),
  }
}
