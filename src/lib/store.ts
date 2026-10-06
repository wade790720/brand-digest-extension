import type { Creator, KnowledgeBase, Post, Settings } from '@/types'

// 資料全存在 chrome.storage.local（manifest 有 unlimitedStorage）。
// 在一般網頁預覽（npm run dev）時沒有 chrome.storage，改用 localStorage，方便開發介面。
const area = {
  async get(keys: string[] | null): Promise<Record<string, any>> {
    if (globalThis.chrome?.storage) return chrome.storage.local.get(keys)
    const all = Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k)!)]))
    return keys ? Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]])) : all
  },
  async set(items: Record<string, unknown>) {
    if (globalThis.chrome?.storage) return chrome.storage.local.set(items)
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v))
  },
  async remove(keys: string[]) {
    if (globalThis.chrome?.storage) return chrome.storage.local.remove(keys)
    keys.forEach((k) => localStorage.removeItem(k))
  },
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'groq',
  keys: {},
  models: {
    groq: 'openai/gpt-oss-120b',
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-opus-5-5',
  },
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await area.get(['settings'])
  return { ...DEFAULT_SETTINGS, ...settings, models: { ...DEFAULT_SETTINGS.models, ...settings?.models } }
}

export const saveSettings = (s: Settings) => area.set({ settings: s })

export async function getCreators(): Promise<Creator[]> {
  const all = await area.get(null)
  return Object.entries(all)
    .filter(([k]) => k.startsWith('creator:'))
    .map(([, v]) => v as Creator)
    .sort((a, b) => b.codes.length - a.codes.length)
}

export async function getPosts(creator: Creator): Promise<Post[]> {
  const got = await area.get(creator.codes.map((c) => `post:${c}`))
  return creator.codes.map((c) => got[`post:${c}`]).filter(Boolean)
}

export const savePost = (p: Post) => area.set({ [`post:${p.code}`]: p })

export async function getKnowledgeBase(creator: string): Promise<KnowledgeBase | undefined> {
  return (await area.get([`kb:${creator}`]))[`kb:${creator}`]
}

export const saveKnowledgeBase = (creator: string, kb: KnowledgeBase) => area.set({ [`kb:${creator}`]: kb })

/** 收集：合併新貼文。已處理的轉錄、萃取保留；網址會更新（IG 的網址幾天後過期，重新滑到就換新的）。
 *  只有背景程式呼叫，所以 creator 索引只有一個寫入者，不會互相覆蓋。 */
export async function mergeCollected(creator: string, fullName: string, posts: Omit<Post, 'status' | 'collectedAt'>[]) {
  const keys = posts.map((p) => `post:${p.code}`)
  const got = await area.get([`creator:${creator}`, ...keys])
  const idx: Creator = got[`creator:${creator}`] ?? { name: creator, fullName, codes: [] }
  const updates: Record<string, unknown> = {}
  let added = 0
  for (const p of posts) {
    const old: Post | undefined = got[`post:${p.code}`]
    updates[`post:${p.code}`] = old ? { ...old, ...p } : { ...p, status: 'new', collectedAt: Date.now() }
    if (!idx.codes.includes(p.code)) {
      idx.codes.push(p.code)
      added++
    }
  }
  // 依發文時間排序（新的在前）。不在這批的舊貼文，時間要另外讀，這裡先只排這批有的
  const known: Record<string, number> = {}
  for (const c of idx.codes) known[c] = ((updates[`post:${c}`] ?? got[`post:${c}`]) as Post | undefined)?.takenAt ?? -1
  const missing = idx.codes.filter((c) => known[c] === -1)
  if (missing.length) {
    const more = await area.get(missing.map((c) => `post:${c}`))
    for (const c of missing) known[c] = (more[`post:${c}`] as Post | undefined)?.takenAt ?? 0
  }
  idx.codes.sort((a, b) => known[b] - known[a])
  idx.fullName = fullName || idx.fullName
  updates[`creator:${creator}`] = idx
  await area.set(updates)
  return { added, total: idx.codes.length }
}

export async function deleteCreator(creator: Creator) {
  await area.remove([`creator:${creator.name}`, `kb:${creator.name}`, ...creator.codes.map((c) => `post:${c}`)])
}

/** 主頁面用：儲存內容有變（例如背景程式收集到新貼文）就通知。 */
export function onStoreChange(cb: () => void): () => void {
  if (!globalThis.chrome?.storage) return () => {}
  const fn = () => cb()
  chrome.storage.onChanged.addListener(fn)
  return () => chrome.storage.onChanged.removeListener(fn)
}
