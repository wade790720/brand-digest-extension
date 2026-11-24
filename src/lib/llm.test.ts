import { beforeEach, expect, it, vi } from 'vitest'
import type { ModelStatus, Settings } from '@/types'

const status: Record<string, ModelStatus> = {}
vi.mock('@/lib/store', () => ({
  MODEL_OPTIONS: { groq: ['a', 'b'], gemini: [], openai: [], anthropic: [] },
  getModelStatus: async () => status,
  getModelLists: async () => ({}),
  setModelStatus: async (k: string, state: ModelStatus['state']) => void (status[k] = { state, at: Date.now() }),
}))
const { fallbackPool, generate, listModels, LlmError, minuteUsage, resetPacing, waitNeeded } = await import('./llm')
const { setLang } = await import('./i18n')
setLang('zh-TW')

const settings = { provider: 'groq', keys: { groq: 'k' }, models: { groq: 'a' } } as unknown as Settings
let calls: string[] = []
let outOfQuota: string[] = []

beforeEach(() => {
  resetPacing()
  for (const k of Object.keys(status)) delete status[k]
  calls = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model
    calls.push(model)
    if (outOfQuota.includes(model)) return new Response('Rate limit reached on tokens per day (TPD)', { status: 429 })
    return new Response(JSON.stringify({ choices: [{ message: { content: `ok-${model}` } }] }))
  })
})

it('這一分鐘的用量：送出後累計，一分鐘後歸零；沒有分鐘上限的供應商不顯示', async () => {
  expect(minuteUsage('groq')).toEqual({ used: 0, cap: 7000, freesInMs: 0 })
  await generate(settings, 'sys', 'user')
  const now = Date.now()
  const u = minuteUsage('groq', now)!
  expect(u.used).toBe(Math.round('sysuser'.length * 1.2) + 1000)
  expect(u.freesInMs).toBeGreaterThan(0)
  expect(minuteUsage('groq', now + 61_000)!.used).toBe(0)
  expect(minuteUsage('openai')).toBeNull()
})

it('額度用完自動換同一家的下一個模型，之後直接跳過用完的', async () => {
  outOfQuota = ['a']
  expect(await generate(settings, 's', 'u')).toBe('ok-b')
  expect(calls).toEqual(['a', 'b'])
  expect(status['groq:a'].state).toBe('quota')
  calls = []
  expect(await generate(settings, 's', 'u')).toBe('ok-b')
  expect(calls).toEqual(['b'])
})

it('全部用完就停下，說明所有模型都用完', async () => {
  outOfQuota = ['a', 'b']
  const err = await generate(settings, 's', 'u').catch((e) => e)
  expect(err).toBeInstanceOf(LlmError)
  expect(err.kind).toBe('quota')
  expect(err.message).toContain('所有模型')
})

it('JSON 模式被 Groq 拒絕，改用一般模式重問', async () => {
  const sent: boolean[] = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const strict = !!JSON.parse(String(init.body)).response_format
    sent.push(strict)
    if (strict) return new Response('{"error":{"message":"Failed to generate JSON.","code":"json_validate_failed"}}', { status: 400 })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }))
  })
  expect(await generate(settings, 's', 'u', { json: true })).toBe('{"ok":1}')
  expect(sent).toEqual([true, false])
})

it('排隊：最近 60 秒加上這次超過上限，就等最舊的幾筆過期', () => {
  const log = [{ at: 0, tokens: 3000 }, { at: 10_000, tokens: 3000 }]
  expect(waitNeeded(log, 20_000, 1000, 7000)).toBe(0)
  expect(waitNeeded(log, 20_000, 2000, 7000)).toBe(40_000)
  expect(waitNeeded(log, 20_000, 5000, 7000)).toBe(50_000)
  expect(waitNeeded(log, 65_000, 5000, 7000)).toBe(5000)
})

it('哪些錯誤要停下整批：金鑰、額度、模型、重試完仍限流或過載；格式錯和太長只跳過這一則', () => {
  for (const kind of ['auth', 'quota', 'model', 'rate', 'overload'] as const) expect(new LlmError('x', kind).isFatal).toBe(true)
  for (const kind of ['too_large', 'bad_json', 'other'] as const) expect(new LlmError('x', kind).isFatal).toBe(false)
})

it('接手的模型：只用金鑰清單上還在的；內建的全下架就用清單前幾個；讀不到清單照舊', () => {
  expect(fallbackPool(['a', 'b', 'c'], ['c', 'a', 'z'])).toEqual(['a', 'c'])
  expect(fallbackPool(['a', 'b'], ['x', 'y', 'z', 'w'])).toEqual(['x', 'y', 'z'])
  expect(fallbackPool(['a', 'b'])).toEqual(['a', 'b'])
})

it('讀模型清單：只留對話模型、去掉語音和圖片模型；失敗回傳 null', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [
    { id: 'openai/gpt-oss-120b' }, { id: 'whisper-large-v3' }, { id: 'meta-llama/llama-guard-4' }, { id: 'qwen/qwen3.8-27b' },
  ] })))
  expect(await listModels('groq', 'k')).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'])
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ models: [
    { name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.8-pro' }, { name: 'models/gemini-3.5-flash-image' }, { name: 'models/text-embedding-5' },
  ] })))
  expect(await listModels('gemini', 'k')).toEqual(['gemini-3.8-flash'])
  vi.stubGlobal('fetch', async () => new Response('no', { status: 401 }))
  expect(await listModels('openai', 'k')).toBeNull()
})
