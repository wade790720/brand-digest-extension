import { toJpeg } from '@/lib/image'
import { igCdn } from '@/lib/parse'
import { t } from '@/lib/i18n'
import type { Creator, KnowledgeBase, ModelStatus, Playbook, Post, Settings, TheoryDoc } from '@/types'

const DEV_CHANGE = 'brand-digest-store-change'

const area = {
  async get(keys: string[] | null): Promise<Record<string, any>> {
    if (globalThis.chrome?.storage) return chrome.storage.local.get(keys)
    const all = Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k)!)]))
    return keys ? Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]])) : all
  },
  async set(items: Record<string, unknown>) {
    if (globalThis.chrome?.storage) return chrome.storage.local.set(items)
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v))
    dispatchEvent(new Event(DEV_CHANGE))
  },
  async keys(): Promise<string[]> {
    if (!globalThis.chrome?.storage) return Object.keys(localStorage)
    // getKeys 要 Chrome 130 以上；更舊的版本只能整份讀出來
    return chrome.storage.local.getKeys ? chrome.storage.local.getKeys() : Object.keys(await chrome.storage.local.get(null))
  },
  async remove(keys: string[]) {
    if (globalThis.chrome?.storage) return chrome.storage.local.remove(keys)
    keys.forEach((k) => localStorage.removeItem(k))
    dispatchEvent(new Event(DEV_CHANGE))
  },
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'groq',
  keys: {},
  models: {
    groq: 'openai/gpt-oss-120b',
    gemini: 'gemini-3.8-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-opus-5-5',
  },
}

export const MODEL_OPTIONS: Record<Settings['provider'], string[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  gemini: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  openai: ['gpt-4o-mini'],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'],
}

export async function getModelStatus(): Promise<Record<string, ModelStatus>> {
  return (await area.get(['modelStatus'])).modelStatus ?? {}
}

export async function setModelStatus(key: string, state: ModelStatus['state']) {
  const all = await getModelStatus()
  if (all[key]?.state === state) return
  await area.set({ modelStatus: { ...all, [key]: { state, at: Date.now() } } })
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await area.get(['settings'])
  return { ...DEFAULT_SETTINGS, ...settings, models: { ...DEFAULT_SETTINGS.models, ...settings?.models } }
}

export const saveSettings = (s: Settings) => area.set({ settings: s })

export async function getCreators(): Promise<Creator[]> {
  const keys = (await area.keys()).filter((k) => k.startsWith('creator:'))
  return (Object.values(await area.get(keys)) as Creator[]).sort((a, b) => b.codes.length - a.codes.length)
}

export async function getPosts(creator: Creator): Promise<Post[]> {
  const got = await area.get(creator.codes.map((c) => `post:${c}`))
  return creator.codes.map((c) => got[`post:${c}`]).filter(Boolean)
}

export const getPost = async (code: string): Promise<Post | undefined> => (await area.get([`post:${code}`]))[`post:${code}`]

/** shortcut: 讀和寫之間沒有鎖，背景程式剛好在這幾毫秒內也寫同一則時仍可能蓋掉；要完全避免得讓收集和萃取寫不同的鍵 */
export async function updatePost(code: string, patch: Partial<Post>) {
  const cur = await getPost(code)
  if (cur) await area.set({ [`post:${code}`]: { ...cur, ...patch } })
}

export async function getKnowledgeBase(creator: string): Promise<KnowledgeBase | undefined> {
  return (await area.get([`kb:${creator}`]))[`kb:${creator}`]
}

export const saveKnowledgeBase = (creator: string, kb: KnowledgeBase) => area.set({ [`kb:${creator}`]: kb })

// 兩批同時合併會讀到同一份舊的主播索引而互相覆蓋：一次只合併一批，誰呼叫都一樣
let merging: Promise<unknown> = Promise.resolve()

export function mergeCollected(creator: string, fullName: string, posts: Omit<Post, 'status' | 'collectedAt'>[]) {
  const run = merging.then(() => mergeOnce(creator, fullName, posts))
  merging = run.catch(() => {})
  return run
}

/** 頭像只抓一次。網址來自 IG 頁面的訊息，這裡再驗一次是 IG 的圖片伺服器
 *  ponytail: 存了就不更新，主播換頭像要刪掉主播重新收集 */
export async function saveAvatar(creator: string, url: string) {
  if (!igCdn(url)) return
  await merging // 同一批的貼文先寫完，這位主播才存在
  const key = `creator:${creator}`
  const known = (await area.get([key]))[key]
  if (!known || known.avatar) return
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) return
  const avatar = await toJpeg(await res.blob(), 96)
  const run = merging.then(async () => {
    const c = (await area.get([key]))[key]
    if (c) await area.set({ [key]: { ...c, avatar } })
  })
  merging = run.catch(() => {})
  return run
}

async function mergeOnce(creator: string, fullName: string, posts: Omit<Post, 'status' | 'collectedAt'>[]) {
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

export async function getCache(scope: string): Promise<Record<string, string>> {
  return (await area.get([`cache:${scope}`]))[`cache:${scope}`] ?? {}
}

export const saveCache = (scope: string, cache: Record<string, string> | null) =>
  cache ? area.set({ [`cache:${scope}`]: cache }) : area.remove([`cache:${scope}`])

export async function getChecks(creator: string): Promise<string[]> {
  return (await area.get([`checks:${creator}`]))[`checks:${creator}`] ?? []
}

export const saveChecks = (creator: string, items: string[]) => area.set({ [`checks:${creator}`]: items })

export async function getPlaybook(creator: string): Promise<Playbook | undefined> {
  return (await area.get([`playbook:${creator}`]))[`playbook:${creator}`]
}

export const savePlaybook = (creator: string, p: Playbook) => area.set({ [`playbook:${creator}`]: p })

export async function getTheories(creator: string): Promise<Record<string, TheoryDoc>> {
  return (await area.get([`theory:${creator}`]))[`theory:${creator}`] ?? {}
}

export async function saveTheory(creator: string, doc: TheoryDoc) {
  await area.set({ [`theory:${creator}`]: { ...(await getTheories(creator)), [doc.topic]: doc } })
}

export async function deleteTheory(creator: string, topic: string) {
  const all = await getTheories(creator)
  delete all[topic]
  await area.set({ [`theory:${creator}`]: all })
  await saveCache(`theory:${creator}:${topic}`, null)
}

export async function deleteCreator(creator: Creator) {
  const all = await area.get(null)
  const caches = Object.keys(all)
    .filter((k) => k === `cache:kb:${creator.name}` || k === `cache:script:${creator.name}` || k.startsWith(`cache:theory:${creator.name}:`))
  const shared = new Set(Object.entries(all).flatMap(([k, v]) => (k.startsWith('creator:') && k !== `creator:${creator.name}` ? (v as Creator).codes : [])))
  await area.remove([`creator:${creator.name}`, `kb:${creator.name}`, `theory:${creator.name}`, `checks:${creator.name}`, `playbook:${creator.name}`, ...caches,
    ...creator.codes.filter((c) => !shared.has(c)).map((c) => `post:${c}`)])
}

const BACKUP_KEY = /^(creator|post|kb|theory|checks|playbook):/

export async function exportAll() {
  const all = await area.get(null)
  const data = Object.fromEntries(Object.entries(all).filter(([k]) => BACKUP_KEY.test(k)))
  return { app: 'brand-digest', version: 1, exportedAt: new Date().toISOString(), data }
}

export async function importAll(backup: unknown): Promise<number> {
  const b = backup as { app?: string; data?: Record<string, unknown> }
  if (b?.app !== 'brand-digest' || typeof b.data !== 'object' || !b.data)
    throw new Error(t('store.notBackup', { app: t('app.name') }))
  const data = Object.fromEntries(Object.entries(b.data).filter(([k]) => BACKUP_KEY.test(k)))
  // 格式不對的主播或貼文會讓畫面壞掉：有一筆不對就整份不匯入
  const malformed = ([k, v]: [string, unknown]) =>
    (k.startsWith('creator:') && !Array.isArray((v as Creator | undefined)?.codes)) ||
    (k.startsWith('post:') && !(typeof (v as Post | undefined)?.code === 'string' && ['new', 'done', 'error'].includes((v as Post).status)))
  if (Object.entries(data).some(malformed)) throw new Error(t('store.notBackup', { app: t('app.name') }))
  const local = await area.get(Object.keys(data))
  for (const [k, v] of Object.entries(data)) {
    const old = local[k]
    if (!old) continue
    if (k.startsWith('post:') && old.status === 'done' && (v as Post).status !== 'done') data[k] = old
    if (k.startsWith('creator:')) {
      const c = v as Creator
      data[k] = { ...old, ...c, codes: [...new Set([...c.codes, ...(old as Creator).codes])] }
    }
    if ((k.startsWith('kb:') || k.startsWith('playbook:')) && (old.updatedAt ?? 0) > ((v as KnowledgeBase).updatedAt ?? 0)) data[k] = old
    if (k.startsWith('theory:')) data[k] = { ...old, ...(v as object) }
    if (k.startsWith('checks:')) data[k] = [...new Set([...(old as string[]), ...(v as string[])])]
  }
  await area.set(data)
  return Object.keys(data).filter((k) => k.startsWith('creator:')).length
}

export function onStoreChange(cb: () => void): () => void {
  if (!globalThis.chrome?.storage) {
    addEventListener(DEV_CHANGE, cb)
    return () => removeEventListener(DEV_CHANGE, cb)
  }
  const fn = () => cb()
  chrome.storage.onChanged.addListener(fn)
  return () => chrome.storage.onChanged.removeListener(fn)
}
