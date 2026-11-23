import { t } from '@/lib/i18n'
import { MODEL_OPTIONS, getModelStatus, setModelStatus } from '@/lib/store'
import type { Provider, Settings } from '@/types'

export class LlmError extends Error {
  readonly kind: 'auth' | 'quota' | 'model' | 'rate' | 'overload' | 'too_large' | 'bad_json' | 'other'
  readonly retryAfterSec?: number
  constructor(message: string, kind: LlmError['kind'], retryAfterSec?: number) {
    super(message)
    this.kind = kind
    this.retryAfterSec = retryAfterSec
  }

  /** 下一則多半也會一樣失敗：停下整批，免得白白消耗每日額度。rate、overload 到呼叫端時已經重試過了 */
  get isFatal() {
    return ['auth', 'quota', 'model', 'rate', 'overload'].includes(this.kind)
  }
}

export const PROVIDER_NAMES: Record<Provider, string> = {
  groq: 'Groq', gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude',
}

/** 一次能送多少字。Groq 免費方案每分鐘只有 8000 token，繁中一字常超過一個 token，加上提示詞，要切小塊。 */
export const inputBudget = (p: Provider) => (p === 'groq' ? 3000 : 60000)

function classify(status: number, body: string, provider: Provider, retryAfter?: string | null): LlmError {
  const name = PROVIDER_NAMES[provider]
  const low = body.toLowerCase()
  const wait = Number(retryAfter) || undefined
  if (status === 413 || low.includes('request too large'))
    return new LlmError(t('llm.tooLarge', { name }), 'too_large')
  if (status === 401 || status === 403) return new LlmError(t('llm.auth', { name }), 'auth')
  if (low.includes('credit balance') || low.includes('insufficient_quota'))
    return new LlmError(t('llm.credit', { name }), 'quota')
  if (/per ?day|perday|tokens per day|requests per day/.test(low))
    return new LlmError(t('llm.daily', { name }), 'quota')
  // Groq 的 JSON 模式：模型輸出沒通過它的格式檢查，就直接回 400、不給結果
  if (low.includes('json_validate_failed') || low.includes('failed to generate json'))
    return new LlmError(t('llm.badJson', { name }), 'bad_json')
  if (status === 429) return new LlmError(t('llm.rate', { name }), 'rate', wait)
  if (status === 404) return new LlmError(t('llm.model', { name }), 'model')
  if (status >= 500) return new LlmError(t('llm.overload', { name }), 'overload', wait)
  return new LlmError(t('llm.other', { name, status, body: body.slice(0, 160) }), 'other')
}

async function post(provider: Provider, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  if (!res.ok) throw classify(res.status, await res.text(), provider, res.headers.get('retry-after'))
  return res.json()
}

async function callOnce(s: Settings, system: string, user: string, json: boolean, signal?: AbortSignal): Promise<string> {
  const p = s.provider
  const key = s.keys[p]
  if (!key) throw new LlmError(t('llm.noKey', { name: PROVIDER_NAMES[p] }), 'auth')
  const model = s.models[p]
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]

  if (p === 'groq' || p === 'openai') {
    const base = p === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'
    const ask = (strict: boolean) => post(p, `${base}/chat/completions`, { authorization: `Bearer ${key}` }, {
      model, messages, temperature: 0.3, ...(strict ? { response_format: { type: 'json_object' } } : {}),
    }, signal)
    const r = await ask(json).catch((e) => (json && e instanceof LlmError && e.kind === 'bad_json' ? ask(false) : Promise.reject(e)))
    return r.choices?.[0]?.message?.content ?? ''
  }
  if (p === 'gemini') {
    const r = await post(p, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': key }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }, signal)
    return (r.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('')
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 })
  try {
    const msg = await client.messages
      .stream({ model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }] }, { signal })
      .finalMessage()
    return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw classify(e.status ?? 0, e.message, p, e.headers?.get?.('retry-after'))
    throw e
  }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, fail) => {
  if (signal?.aborted) return fail(signal.reason)
  const id = setTimeout(ok, ms)
  signal?.addEventListener('abort', () => (clearTimeout(id), fail(signal.reason)), { once: true })
})
const DAY = 24 * 60 * 60 * 1000

/** ponytail: 只換同一家的模型。換供應商的話，每批送多少字（inputBudget）也要跟著變，做到一半換會出錯。 */
async function candidates(prefix: string, preferred: string, others: string[]) {
  const st = await getModelStatus()
  const out = (m: string) => {
    const x = st[`${prefix}:${m}`]
    return x?.state === 'missing' || (x?.state === 'quota' && Date.now() - x.at < DAY)
  }
  const usable = [...new Set([preferred, ...others])].filter((m) => !out(m))
  return usable.length ? usable : [preferred]
}

async function withFallback<T>(prefix: string, models: string[], exhausted: string, onSwitch: ((m: string) => void) | undefined,
  fn: (model: string) => Promise<T>): Promise<T> {
  for (const [i, model] of models.entries()) {
    try {
      const out = await fn(model)
      await setModelStatus(`${prefix}:${model}`, 'ok')
      return out
    } catch (e) {
      if (!(e instanceof LlmError) || (e.kind !== 'quota' && e.kind !== 'model')) throw e
      await setModelStatus(`${prefix}:${model}`, e.kind === 'quota' ? 'quota' : 'missing')
      const next = models[i + 1]
      if (!next) throw e.kind === 'quota' ? new LlmError(exhausted, 'quota') : e
      onSwitch?.(t(e.kind === 'quota' ? 'llm.switchQuota' : 'llm.switchMissing', { model, next }))
    }
  }
  throw new Error('unreachable')
}

async function retryRate<T>(fn: () => Promise<T>, onWait?: (msg: string) => void, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof LlmError) || (e.kind !== 'rate' && e.kind !== 'overload')) throw e
      if (attempt >= (e.kind === 'rate' ? 10 : 4)) throw e
      const sec = Math.min(e.retryAfterSec ?? (e.kind === 'rate' ? 20 : 5 * 2 ** attempt), 60)
      onWait?.(t('llm.waitAuto', { msg: e.message, s: Math.round(sec) }))
      await sleep(sec * 1000, signal)
    }
  }
}

// Groq 免費方案每個模型每分鐘 8000 token，留一點餘裕。其他供應商的上限高很多，不排隊。
// ponytail: token 用「字數 × 1.2 + 1000（回答）」估；所有模型共用一張紀錄表（實際是每個模型分開算，這樣比較保守）
const TPM: Partial<Record<Provider, number>> = { groq: 7000 }
const sentLog: Partial<Record<Provider, { at: number; tokens: number }[]>> = {}

export function waitNeeded(log: { at: number; tokens: number }[], now: number, need: number, cap: number) {
  const recent = log.filter((x) => now - x.at < 60_000)
  let used = recent.reduce((n, x) => n + x.tokens, 0)
  if (used + need <= cap) return 0
  for (const x of recent) {
    used -= x.tokens
    if (used + need <= cap) return x.at + 60_000 - now
  }
  return 0
}

async function pace(p: Provider, chars: number, onWait?: (msg: string) => void, signal?: AbortSignal) {
  const cap = TPM[p]
  if (!cap) return
  const need = Math.min(Math.round(chars * 1.2) + 1000, cap)
  const log = (sentLog[p] ??= [])
  for (let ms = waitNeeded(log, Date.now(), need, cap); ms > 0; ms = waitNeeded(log, Date.now(), need, cap)) {
    onWait?.(t('llm.pace', { name: PROVIDER_NAMES[p], s: Math.ceil(ms / 1000) }))
    await sleep(ms, signal)
  }
  log.splice(0, log.length, ...log.filter((x) => Date.now() - x.at < 60_000), { at: Date.now(), tokens: need })
}

export function minuteUsage(p: Provider, now = Date.now()) {
  const cap = TPM[p]
  if (!cap) return null
  const recent = (sentLog[p] ?? []).filter((x) => now - x.at < 60_000)
  return { used: recent.reduce((n, x) => n + x.tokens, 0), cap, freesInMs: recent.length ? recent[0].at + 60_000 - now : 0 }
}

export const resetPacing = () => Object.keys(sentLog).forEach((k) => delete sentLog[k as Provider])

export async function generate(s: Settings, system: string, user: string,
  opts: { json?: boolean; onWait?: (msg: string) => void; signal?: AbortSignal } = {}) {
  const p = s.provider
  const models = await candidates(p, s.models[p], MODEL_OPTIONS[p])
  const exhausted = t('llm.allUsed', { name: PROVIDER_NAMES[p] })
  return withFallback(p, models, exhausted, opts.onWait, (model) =>
    retryRate(async () => {
      await pace(p, system.length + user.length, opts.onWait, opts.signal)
      return callOnce({ ...s, models: { ...s.models, [p]: model } }, system, user, !!opts.json, opts.signal)
    }, opts.onWait, opts.signal))
}

// 兩個 Whisper 模型的額度分開算：turbo 用完就換 large-v3
export const WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3']

export async function transcribe(s: Settings, audio: Blob, onWait?: (msg: string) => void, signal?: AbortSignal): Promise<string> {
  const key = s.keys.groq
  if (!key) throw new LlmError(t('llm.groqNeeded'), 'auth')
  const once = async (model: string) => {
    const form = new FormData()
    form.append('file', audio, 'audio.mp4')
    form.append('model', model)
    form.append('response_format', 'text')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal,
    })
    if (res.ok) return (await res.text()).trim()
    const err = classify(res.status, await res.text(), 'groq', res.headers.get('retry-after'))
    if (err.kind === 'quota') throw new LlmError(t('llm.whisperQuota', { model }), 'quota')
    throw err
  }
  const models = await candidates('whisper', WHISPER[0], WHISPER)
  const exhausted = t('llm.whisperAll')
  return withFallback('whisper', models, exhausted, onWait, (m) => retryRate(() => once(m), onWait, signal))
}

export function parseJson(raw: string): any {
  const tries = [raw, raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')]
  for (const t of tries) {
    try {
      return JSON.parse(t)
    } catch {}
  }
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch {}
  }
  return null
}

export async function checkGroqKey(key: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${key}` } })
    if (res.ok) return null
    return res.status === 401 ? t('llm.keyWrong') : t('llm.keyHttp', { status: res.status })
  } catch {
    return t('llm.offline')
  }
}
