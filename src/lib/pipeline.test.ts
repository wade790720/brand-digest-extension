import { beforeEach, expect, it, vi } from 'vitest'
import type { Creator, Post } from '@/types'

// 用記憶體版的 localStorage 跑真的 store（store 沒有 chrome.storage 時改用 localStorage，並用 Object.keys 列出鍵）
const ls: Record<string, string> = {}
Object.defineProperties(ls, {
  getItem: { value: (k: string) => ls[k] ?? null },
  setItem: { value: (k: string, v: string) => void (ls[k] = v) },
  removeItem: { value: (k: string) => void delete ls[k] },
})
const mem = {
  get: (k: string) => ls[k],
  set: (k: string, v: string) => void (ls[k] = v),
  has: (k: string) => k in ls,
  clear: () => Object.keys(ls).forEach((k) => delete ls[k]),
}
vi.stubGlobal('localStorage', ls)
vi.stubGlobal('dispatchEvent', () => true)

const { processCreator } = await import('./pipeline')
const { deleteCreator, getPosts, mergeCollected, saveSettings } = await import('./store')
const { generate } = await import('./llm')
const { setLang } = await import('./i18n')
setLang('zh-TW')

const creator: Creator = { name: 'coach', fullName: '', codes: ['A'] }
const seed = (p: Partial<Post> = {}) =>
  mem.set('post:A', JSON.stringify({ code: 'A', creator: 'coach', takenAt: 1, caption: '開場三秒', collectedAt: 0, status: 'new', ...p }))

// AI 回傳的內容；onChat 讓測試在 AI 回答之前做別的事（例如模擬背景程式收集）
let reply = '{"topic":"t","points":["p"],"quotes":[],"terms":[],"value":"高"}'
let onChat = async () => {}

beforeEach(async () => {
  mem.clear()
  mem.set('creator:coach', JSON.stringify(creator))
  // OpenAI 不排隊（Groq 每分鐘上限的排隊會讓測試等很久）；Groq 金鑰轉錄要用，仍要填
  await saveSettings({ provider: 'openai', keys: { groq: 'k', openai: 'k' }, models: { openai: 'gpt-4o-mini' } } as never)
  onChat = async () => {}
  vi.stubGlobal('fetch', async () => {
    await onChat()
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }))
  })
})

const run = () => processCreator(creator, new AbortController().signal, () => {})
const post = async () => (await getPosts(creator))[0]

it('AI 回的 JSON 壞掉：這則算失敗，下次會重做，不是空白的「完成」', async () => {
  seed()
  reply = 'not json at all'
  await run()
  expect((await post()).status).toBe('error')
  reply = '{"topic":"t","points":["p"],"quotes":[],"terms":[],"value":"高"}'
})

it('萃取途中收集到的新數字和網址，萃取存檔時不會被舊的蓋掉', async () => {
  seed({ stats: { likes: 1 }, audioUrl: undefined })
  onChat = async () => {
    onChat = async () => {} // 只在萃取那次呼叫時收集一次；之後整合知識庫的呼叫不再收集
    await mergeCollected('coach', '', [{ code: 'A', creator: 'coach', takenAt: 1, caption: '開場三秒', stats: { likes: 999 }, thumbUrl: 'https://x.cdninstagram.com/t.jpg' }])
  }
  await run()
  const p = await post()
  expect(p.status).toBe('done')
  expect(p.stats?.likes).toBe(999)
  expect(p.thumbUrl).toBe('https://x.cdninstagram.com/t.jpg')
})

it('刪除主播：另一位主播也列著的合作貼文留著', async () => {
  seed()
  mem.set('post:B', JSON.stringify({ code: 'B', creator: 'coach', takenAt: 2, caption: '', collectedAt: 0, status: 'new' }))
  mem.set('creator:guest', JSON.stringify({ name: 'guest', fullName: '', codes: ['A'] }))
  await deleteCreator({ name: 'coach', fullName: '', codes: ['A', 'B'] })
  expect(mem.has('post:A')).toBe(true)
  expect(mem.has('post:B')).toBe(false)
  expect(mem.has('creator:coach')).toBe(false)
})

it('按停止：限流等待中的 AI 呼叫馬上結束，不用等重試', async () => {
  vi.stubGlobal('fetch', async () => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }))
  const ctrl = new AbortController()
  const call = generate(JSON.parse(mem.get('settings')!), 's', 'u', { signal: ctrl.signal })
  setTimeout(() => ctrl.abort(), 20)
  const started = Date.now()
  await expect(call).rejects.toThrow()
  expect(Date.now() - started).toBeLessThan(2000)
})
