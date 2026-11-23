import { avatarOf, extractPosts } from '@/lib/parse'
import type { CollectMessage } from '@/types'

const useful = (text: string) => text.includes('"code"') || text.includes('profile_pic_url')

/** 一般 JSON 直接解析；串流格式（好幾段 JSON 一行一段）就逐行解析。解析不了的略過，不能影響 IG 頁面本身 */
function parseAll(text: string): unknown[] {
  const tryParse = (t: string) => {
    try {
      return [JSON.parse(t)]
    } catch {
      return []
    }
  }
  const whole = tryParse(text.replace(/^for \(;;\);/, ''))
  return whole.length ? whole : text.split('\n').flatMap((line) => (useful(line) ? tryParse(line) : []))
}

/** 頭像和貼文在不同段資料裡，先後不固定：記住頭像，跟著貼文送；貼文已經送過就補送一則 */
export function createCollector(send: (msg: CollectMessage) => void) {
  const avatars = new Map<string, string>()
  const sent = new Set<string>()
  return (text: string, creator: string) => {
    if (!useful(text)) return
    for (const json of parseAll(text)) {
      const pic = avatarOf(json, creator)
      const fresh = !!pic && !avatars.has(creator)
      if (pic) avatars.set(creator, pic)
      const msg = extractPosts(json, creator)
      const avatarUrl = avatars.get(creator)
      if (msg) {
        sent.add(creator)
        send({ ...msg, ...(avatarUrl && { avatarUrl }) })
      } else if (fresh && sent.has(creator)) {
        send({ type: 'collect', creator, fullName: '', avatarUrl: pic, posts: [] })
      }
    }
  }
}
