import { beforeEach, expect, it, vi } from 'vitest'
import type { Creator, Post } from '@/types'

import { mem } from './test-storage'

const { processCreator } = await import('./pipeline')
const { deleteCreator, getPosts, mergeCollected, saveSettings } = await import('./store')
const { generate } = await import('./llm')
const { setLang } = await import('./i18n')
setLang('zh-TW')

const creator: Creator = { name: 'coach', fullName: '', codes: ['A'] }
const seed = (p: Partial<Post> = {}) =>
  mem.set('post:A', JSON.stringify({ code: 'A', creator: 'coach', takenAt: 1, caption: '開場三秒', collectedAt: 0, status: 'new', ...p }))

let reply = '{"topic":"t","points":["p"],"quotes":[],"terms":[],"value":"高"}'
let onChat = async () => {}

beforeEach(async () => {
  mem.clear()
  mem.set('creator:coach', JSON.stringify(creator))
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
    onChat = async () => {}
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

it('AI 回的是陣列或字串，不是物件：同樣算失敗，不存成空白的完成', async () => {
  seed()
  reply = '[{"topic":"t","points":["p"],"quotes":[],"terms":[],"value":"高"}]'
  await run()
  expect((await post()).status).toBe('error')
  reply = '{"topic":"t","points":["p"],"quotes":[],"terms":[],"value":"高"}'
})

const kbPosts = (n: number) => {
  const codes = Array.from({ length: n }, (_, i) => `K${i + 1}`)
  codes.forEach((code, i) => mem.set(`post:${code}`, JSON.stringify({ code, creator: 'coach', takenAt: n - i, caption: '', collectedAt: 0, status: 'done',
    digest: { topic: `主題${i + 1}`, points: ['重點'], quotes: [], terms: [], value: '高' } })))
  return { name: 'coach', fullName: '', codes } as Creator
}
const fullKb = '## 這個創作者在教什麼\n\n- 先刪再快 [1]\n\n## 核心方法論\n\n- 先刪 [2]\n\n## 主題聚類\n\n- 時間 [3]\n\n## 可行動清單\n\n- [ ] 刪一步 [1]'

it('知識庫：AI 漏了章節或寫錯編號，程式抓到後請它修一次，修好的版本才存', async () => {
  const { buildKnowledgeBase } = await import('./pipeline')
  const { getKnowledgeBase, getSettings } = await import('./store')
  const c = kbPosts(3)
  const replies = ['## 這個創作者在教什麼\n\n- 先刪再快 [9]', fullKb]
  const asked: string[] = []
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    asked.push(JSON.parse(String(init.body)).messages[1].content)
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }))
  })
  await buildKnowledgeBase(c, await getSettings(), () => {})
  expect(asked).toHaveLength(2)
  expect(asked[1]).toContain('[9]')
  const kb = (await getKnowledgeBase('coach'))!.markdown
  expect(kb).toContain('## 可行動清單')
  expect(kb).not.toContain('未引用')
})

it('知識庫：修正那次呼叫失敗，就存原本的版本，沒引用的貼文標在來源索引', async () => {
  const { buildKnowledgeBase } = await import('./pipeline')
  const { getKnowledgeBase, getSettings } = await import('./store')
  const c = kbPosts(3)
  let calls = 0
  vi.stubGlobal('fetch', async () => (++calls === 1
    ? new Response(JSON.stringify({ choices: [{ message: { content: fullKb.replace('[3]', '').replace('## 主題聚類', '## 其他') } }] }))
    : new Response('bad key', { status: 401 })))
  await buildKnowledgeBase(c, await getSettings(), () => {})
  const kb = (await getKnowledgeBase('coach'))!.markdown
  expect(calls).toBe(2)
  expect(kb).toContain('## 其他')
  expect(kb).toMatch(/3\. 主題3 — \[看原文\]\([^)]+\)（未引用）/)
  expect(kb).toContain('1 則沒有被引用')
})
