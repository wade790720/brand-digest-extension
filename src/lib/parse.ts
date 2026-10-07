import type { CollectMessage } from '@/types'

type Item = Record<string, any>

/** 目前頁面若是主播主頁（instagram.com/<帳號>/），回傳帳號；其他頁面回傳 null。
 *  只在主頁收集：Reels 分頁的資料沒有影片與文案；首頁動態、探索頁是別人的貼文，不收。 */
export function profileOf(pathname: string): string | null {
  const m = pathname.match(/^\/([A-Za-z0-9._]+)\/?$/)
  const reserved = ['explore', 'reels', 'direct', 'accounts', 'stories', 'p', 'reel']
  return m && !reserved.includes(m[1]) ? m[1].toLowerCase() : null
}

/** DASH manifest 裡的音軌網址。只下載音軌：一則約 350 KB，轉錄只需要聲音。 */
export function audioUrlOf(manifest?: string): string | undefined {
  if (!manifest) return undefined
  for (const set of manifest.split('<AdaptationSet').slice(1)) {
    const head = set.slice(0, set.indexOf('>'))
    const isAudio = /contentType="audio"|mimeType="audio/.test(head) || /<Representation[^>]*mimeType="audio/.test(set)
    const url = set.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1]
    if (isAudio && url) return url.replace(/&amp;/g, '&')
  }
  return undefined
}

/** 從 IG 頁面自己收到的 graphql 回應中，挑出這位主播的貼文。
 *  回應格式不固定，所以遞迴找「有 code 和 media_type 的物件」。 */
export function extractPosts(json: unknown, creator: string): CollectMessage | null {
  const items: Item[] = []
  ;(function walk(o: unknown) {
    if (!o || typeof o !== 'object') return
    const it = o as Item
    if (typeof it.code === 'string' && 'media_type' in it && it.user?.username) {
      items.push(it)
      return
    }
    for (const v of Object.values(it)) walk(v)
  })(json)

  // 主播自己發的，加上合作貼文（發文者是別人、主播是共同作者）
  const isCreator = (u: Item | undefined) => u?.username?.toLowerCase() === creator
  const mine = items.filter((it) => [it.user, ...(it.coauthor_producers ?? []), ...(it.invited_coauthor_producers ?? [])].some(isCreator))
  if (!mine.length) return null
  return {
    type: 'collect',
    creator,
    fullName: mine.find((it) => isCreator(it.user))?.user.full_name ?? '',
    posts: mine.map((it) => ({
      code: it.code,
      creator,
      takenAt: it.taken_at ?? 0,
      caption: it.caption?.text ?? '',
      audioUrl: audioUrlOf(it.video_dash_manifest),
      videoUrl: it.video_versions?.[0]?.url,
    })),
  }
}
