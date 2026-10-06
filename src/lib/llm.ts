import Anthropic from '@anthropic-ai/sdk'
import type { Provider, Settings } from '@/types'

/** 給使用者看的錯誤。kind 決定要停下整批（auth、quota）還是只跳過這一則。 */
export class LlmError extends Error {
  readonly kind: 'auth' | 'quota' | 'rate' | 'too_large' | 'other'
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

/** 一次能送多少字。Groq 免費方案每分鐘只有 8000 token，中文大約一字一 token，要切小塊。 */
export const inputBudget = (p: Provider) => (p === 'groq' ? 4000 : 60000)

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
  if (status === 429) return new LlmError(`${name} 請求太頻繁，稍候自動重試。`, 'rate', wait)
  if (status === 404) return new LlmError(`${name} 找不到模型，請到設定換一個模型名稱。`, 'auth')
  if (status >= 500) return new LlmError(`${name} 伺服器暫時過載，稍候自動重試。`, 'rate', wait)
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
    const r = await post(p, `${base}/chat/completions`, { authorization: `Bearer ${key}` }, {
      model, messages, temperature: 0.3, ...(json ? { response_format: { type: 'json_object' } } : {}),
    })
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

/** 呼叫 AI。限流或伺服器忙會等一下自動重試（遵守 retry-after），其他錯誤直接拋出。 */
export async function generate(s: Settings, system: string, user: string, opts: { json?: boolean; onWait?: (msg: string) => void } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(s, system, user, !!opts.json)
    } catch (e) {
      if (!(e instanceof LlmError) || e.kind !== 'rate' || attempt >= 4) throw e
      const sec = Math.min(e.retryAfterSec ?? 5 * 2 ** attempt, 90)
      opts.onWait?.(`${e.message}（等 ${Math.round(sec)} 秒）`)
      await sleep(sec * 1000)
    }
  }
}

/** 轉錄一律用 Groq Whisper：免費額度夠用、速度快。瀏覽器裡用不到本機 GPU。 */
export async function transcribe(s: Settings, audio: Blob): Promise<string> {
  const key = s.keys.groq
  if (!key) throw new LlmError('轉錄需要 Groq 金鑰（免費），請到設定填寫。', 'auth')
  for (let attempt = 0; ; attempt++) {
    const form = new FormData()
    form.append('file', audio, 'audio.mp4')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('response_format', 'text')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form,
    })
    if (res.ok) return (await res.text()).trim()
    const err = classify(res.status, await res.text(), 'groq', res.headers.get('retry-after'))
    if (err.kind !== 'rate' || attempt >= 4) throw err
    await sleep(Math.min(err.retryAfterSec ?? 5 * 2 ** attempt, 90) * 1000)
  }
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
