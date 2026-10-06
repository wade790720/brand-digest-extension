import { beforeEach, expect, it, vi } from 'vitest'
import type { ModelStatus, Settings } from '@/types'

// 模型狀態存在記憶體裡，不碰 chrome.storage
const status: Record<string, ModelStatus> = {}
vi.mock('@/lib/store', () => ({
  MODEL_OPTIONS: { groq: ['a', 'b'], gemini: [], openai: [], anthropic: [] },
  getModelStatus: async () => status,
  setModelStatus: async (k: string, state: ModelStatus['state']) => void (status[k] = { state, at: Date.now() }),
}))
const { generate, LlmError } = await import('./llm')

const settings = { provider: 'groq', keys: { groq: 'k' }, models: { groq: 'a' } } as unknown as Settings
let calls: string[] = []
let outOfQuota: string[] = []

beforeEach(() => {
  for (const k of Object.keys(status)) delete status[k]
  calls = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model
    calls.push(model)
    if (outOfQuota.includes(model)) return new Response('Rate limit reached on tokens per day (TPD)', { status: 429 })
    return new Response(JSON.stringify({ choices: [{ message: { content: `ok-${model}` } }] }))
  })
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
