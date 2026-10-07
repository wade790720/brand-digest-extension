import Anthropic from '@anthropic-ai/sdk'
import { MODEL_OPTIONS, getModelStatus, setModelStatus } from '@/lib/store'
import type { Provider, Settings } from '@/types'

/** 給使用者看的錯誤。kind 決定要停下整批（auth、quota、model、重試後仍 rate）還是只跳過這一則。 */
export class LlmError extends Error {
  readonly kind: 'auth' | 'quota' | 'model' | 'rate' | 'overload' | 'too_large' | 'bad_json' | 'other'
  readonly retryAfterSec?: number
  constructor(message: string, kind: LlmError['kind'], retryAfterSec?: number) {
    super(message)
    this.kind = kind
    this.retryAfterSec = retryAfterSec
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
    return new LlmError(`${name}：這次送出的內容太長，超過模型每分鐘的上限。`, 'too_large')
  if (status === 401 || status === 403) return new LlmError(`${name} 金鑰無效或沒有權限，請到設定重新填寫。`, 'auth')
  if (low.includes('credit balance') || low.includes('insufficient_quota'))
    return new LlmError(`${name} 帳戶額度不足，請到該供應商後台儲值，或在設定換一個供應商。`, 'quota')
  if (/per ?day|perday|tokens per day|requests per day/.test(low))
    return new LlmError(`${name} 今天的免費額度用完了，明天再試，或在設定換一個供應商。`, 'quota')
  // Groq 的 JSON 模式：模型輸出沒通過它的格式檢查，就直接回 400、不給結果
  if (low.includes('json_validate_failed') || low.includes('failed to generate json'))
    return new LlmError(`${name} 產生的 JSON 格式不對。`, 'bad_json')
  if (status === 429) return new LlmError(`${name} 達到每分鐘上限。`, 'rate', wait)
  if (status === 404) return new LlmError(`${name} 找不到模型，請到設定換一個模型。`, 'model')
  if (status >= 500) return new LlmError(`${name} 伺服器暫時過載。`, 'overload', wait)
  return new LlmError(`${name} 回應錯誤（HTTP ${status}）：${body.slice(0, 160)}`, 'other')
}

async function post(provider: Provider, url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  if (!res.ok) throw classify(res.status, await res.text(), provider, res.headers.get('retry-after'))
  return res.json()
}

async function callOnce(s: Settings, system: string, user: string, json: boolean): Promise<string> {
  const p = s.provider
  const key = s.keys[p]
  if (!key) throw new LlmError(`還沒有填 ${PROVIDER_NAMES[p]} 的金鑰，請到設定填寫。`, 'auth')
  const model = s.models[p]
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]

  if (p === 'groq' || p === 'openai') {
    const base = p === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'
    const ask = (strict: boolean) => post(p, `${base}/chat/completions`, { authorization: `Bearer ${key}` }, {
      model, messages, temperature: 0.3, ...(strict ? { response_format: { type: 'json_object' } } : {}),
    })
    // JSON 模式被拒就改用一般模式重問：提示詞本來就要求只回 JSON，呼叫端用 parseJson 容錯解析
    const r = await ask(json).catch((e) => (json && e instanceof LlmError && e.kind === 'bad_json' ? ask(false) : Promise.reject(e)))
    return r.choices?.[0]?.message?.content ?? ''
  }
  if (p === 'gemini') {
    // 金鑰放 header，不放網址
    const r = await post(p, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': key }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
      })
    return (r.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('')
  }
  // Anthropic：官方 SDK。金鑰是使用者自己的、只存在本機，所以允許在瀏覽器直接呼叫。
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 })
  try {
    const msg = await client.messages
      .stream({ model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }] })
      .finalMessage()
    return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw classify(e.status ?? 0, e.message, p, e.headers?.get?.('retry-after'))
    throw e
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DAY = 24 * 60 * 60 * 1000

/** 要依序試的模型：偏好的排第一，再來是同一家的其他模型（每個模型的額度分開算）。
 *  上次記錄額度用完（24 小時內）或找不到的先跳過；全部都跳過時仍試偏好的那個，因為記錄可能過時。
 *  ponytail: 只換同一家的模型。換供應商的話，每批送多少字（inputBudget）也要跟著變，做到一半換會出錯。 */
async function candidates(prefix: string, preferred: string, others: string[]) {
  const st = await getModelStatus()
  const out = (m: string) => {
    const x = st[`${prefix}:${m}`]
    return x?.state === 'missing' || (x?.state === 'quota' && Date.now() - x.at < DAY)
  }
  const usable = [...new Set([preferred, ...others])].filter((m) => !out(m))
  return usable.length ? usable : [preferred]
}

/** 依序換模型呼叫 fn。額度用完或找不到模型就換下一個，其他錯誤直接拋出。 */
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
      onSwitch?.(`${model} ${e.kind === 'quota' ? '額度用完' : '無法使用'}，改用 ${next}`)
    }
  }
  throw new Error('unreachable')
}

/** 限流或伺服器忙會等一下自動重試（遵守 retry-after），其他錯誤直接拋出。 */
/** 每分鐘上限（429）等一下一定會恢復，耐心等，最多約 10 分鐘；
 *  伺服器過載（5xx）重試 4 次還不行就停下，免得一直消耗每日額度。 */
async function retryRate<T>(fn: () => Promise<T>, onWait?: (msg: string) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof LlmError) || (e.kind !== 'rate' && e.kind !== 'overload')) throw e
      if (attempt >= (e.kind === 'rate' ? 10 : 4)) throw e
      const sec = Math.min(e.retryAfterSec ?? (e.kind === 'rate' ? 20 : 5 * 2 ** attempt), 60)
      onWait?.(`${e.message}等 ${Math.round(sec)} 秒後自動繼續`)
      await sleep(sec * 1000)
    }
  }
}

// —— 送出前排隊，不去撞每分鐘上限 ——
// Groq 免費方案每個模型每分鐘 8000 token，留一點餘裕。其他供應商的上限高很多，不排隊。
// ponytail: token 用「字數 × 1.2 + 1000（回答）」估；所有模型共用一張紀錄表（實際是每個模型分開算，這樣比較保守）
const TPM: Partial<Record<Provider, number>> = { groq: 7000 }
const sentLog: Partial<Record<Provider, { at: number; tokens: number }[]>> = {}

/** 最近 60 秒已送出的量加上這次，超過上限就回傳要等幾毫秒，不用等回傳 0 */
export function waitNeeded(log: { at: number; tokens: number }[], now: number, need: number, cap: number) {
  const recent = log.filter((x) => now - x.at < 60_000) // 依送出時間排序，舊的在前
  let used = recent.reduce((n, x) => n + x.tokens, 0)
  if (used + need <= cap) return 0
  // 等最舊的幾筆滿 60 秒、從紀錄裡掉出去，直到空出這次需要的量
  for (const x of recent) {
    used -= x.tokens
    if (used + need <= cap) return x.at + 60_000 - now
  }
  return 0 // need 已經限制在 cap 以內，走不到這裡
}

async function pace(p: Provider, chars: number, onWait?: (msg: string) => void) {
  const cap = TPM[p]
  if (!cap) return
  const need = Math.min(Math.round(chars * 1.2) + 1000, cap)
  const log = (sentLog[p] ??= [])
  for (let ms = waitNeeded(log, Date.now(), need, cap); ms > 0; ms = waitNeeded(log, Date.now(), need, cap)) {
    onWait?.(`配合 ${PROVIDER_NAMES[p]} 每分鐘上限，等 ${Math.ceil(ms / 1000)} 秒`)
    await sleep(ms)
  }
  log.splice(0, log.length, ...log.filter((x) => Date.now() - x.at < 60_000), { at: Date.now(), tokens: need })
}

/** 測試用：清掉排隊紀錄 */
export const resetPacing = () => Object.keys(sentLog).forEach((k) => delete sentLog[k as Provider])

/** 呼叫 AI。限流會等一下重試；這個模型額度用完，自動換同一家的下一個模型。 */
export async function generate(s: Settings, system: string, user: string, opts: { json?: boolean; onWait?: (msg: string) => void } = {}) {
  const p = s.provider
  const models = await candidates(p, s.models[p], MODEL_OPTIONS[p])
  const exhausted = `${PROVIDER_NAMES[p]} 所有模型今天的免費額度都用完了。額度恢復後再試，或在設定換一個供應商。`
  return withFallback(p, models, exhausted, opts.onWait, (model) =>
    retryRate(async () => {
      await pace(p, system.length + user.length, opts.onWait)
      return callOnce({ ...s, models: { ...s.models, [p]: model } }, system, user, !!opts.json)
    }, opts.onWait))
}

// 兩個 Whisper 模型的額度分開算：turbo 用完就換 large-v3
const WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3']

/** 轉錄一律用 Groq Whisper：免費額度夠用、速度快。瀏覽器裡用不到本機 GPU。 */
export async function transcribe(s: Settings, audio: Blob, onWait?: (msg: string) => void): Promise<string> {
  const key = s.keys.groq
  if (!key) throw new LlmError('轉錄需要 Groq 金鑰（免費），請到設定填寫。', 'auth')
  const once = async (model: string) => {
    const form = new FormData()
    form.append('file', audio, 'audio.mp4')
    form.append('model', model)
    form.append('response_format', 'text')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form,
    })
    if (res.ok) return (await res.text()).trim()
    const err = classify(res.status, await res.text(), 'groq', res.headers.get('retry-after'))
    // 訊息要講明是轉錄，也不能叫使用者換供應商：轉錄固定用 Groq，換了也沒用
    if (err.kind === 'quota') throw new LlmError(`Groq 轉錄（${model}）今天的免費額度用完了。`, 'quota')
    throw err
  }
  const models = await candidates('whisper', WHISPER[0], WHISPER)
  const exhausted = 'Groq 轉錄（語音轉文字）的兩個模型今天的免費額度都用完了。轉錄固定用 Groq，換「整理重點用的 AI」沒有用。額度是滾動 24 小時計算，晚點再按「開始萃取」。'
  return withFallback('whisper', models, exhausted, onWait, (m) => retryRate(() => once(m), onWait))
}

/** 容錯解析 JSON：模型可能包 markdown 圍欄，或前後多講話。 */
export function parseJson(raw: string): any {
  const tries = [raw, raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')]
  for (const t of tries) {
    try {
      return JSON.parse(t)
    } catch {
      /* 試下一種 */
    }
  }
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return JSON.parse(m[0])
    } catch {
      /* 放棄 */
    }
  }
  return null
}

/** 驗證 Groq 金鑰：讀模型清單，不用額度。可以用回傳 null，不行回傳給使用者看的原因。 */
export async function checkGroqKey(key: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${key}` } })
    if (res.ok) return null
    return res.status === 401 ? '金鑰不對。請回到 Groq 重新複製一次，開頭應該是 gsk_。' : `Groq 回應錯誤（HTTP ${res.status}），請稍後再試。`
  } catch {
    return '連不上 Groq，請確認網路連線。'
  }
}
