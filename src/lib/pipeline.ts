import { toJpeg } from '@/lib/image'
import { LlmError, PROVIDER_NAMES, generate, inputBudget, parseJson, transcribe } from '@/lib/llm'
import { getLang, t, type Lang } from '@/lib/i18n'
import { HOOK_TYPES, aggregateSystem, aggregateUser, digestSystem, digestUser, mergeUser } from '@/lib/prompts'
import { getCache, getPost, getPosts, getSettings, saveCache, saveKnowledgeBase, updatePost } from '@/lib/store'
import type { Creator, Digest, Post, Settings } from '@/types'

/** 萃取一則貼文的步驟；kb 是最後整合知識庫 */
export type Step = 'download' | 'transcribe' | 'extract' | 'kb'

/** 執行紀錄的一筆。warn 是自動等待或換模型，error 是這則失敗 */
export interface RunEvent {
  level: 'info' | 'warn' | 'error'
  text: string
  code?: string
}

export interface Progress {
  done: number
  total: number
  status: string
  codes?: string[]
  current?: string
  step?: Step
  event?: RunEvent
}

const PAUSE_MIN = 3
const PAUSE_MAX = 6

const postUrl = (code: string) => `https://www.instagram.com/p/${code}/`

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })
}

export function toDigest(raw: any): Digest {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  return {
    topic: String(raw?.topic ?? t('pipe.noTopic')),
    points: list(raw?.points),
    quotes: list(raw?.quotes),
    terms: list(raw?.terms),
    value: VALUE_ALIAS[String(raw?.value ?? '').trim().toLowerCase()] ?? '中',
    ...(raw?.hookType && { hookType: HOOK_TYPES.includes(String(raw.hookType).trim()) ? String(raw.hookType).trim() : '其他' }),
  }
}

async function download(p: Post, signal: AbortSignal): Promise<Blob> {
  const url = p.audioUrl ?? p.videoUrl!
  const res = await fetch(url, { credentials: 'omit', signal })
  if (res.status === 403 || res.status === 410)
    throw new Error(t('pipe.expired'))
  if (!res.ok) throw new Error(t('pipe.downloadFail', { status: res.status }))
  return res.blob()
}

async function saveThumb(p: Post, signal: AbortSignal) {
  if (p.thumb || !p.thumbUrl) return
  try {
    const res = await fetch(p.thumbUrl, { credentials: 'omit', signal })
    if (!res.ok) return
    p.thumb = await toJpeg(await res.blob(), 160)
  } catch {}
}

export async function processCreator(creator: Creator, signal: AbortSignal, onProgress: (p: Progress) => void, limit?: number) {
  const settings = await getSettings()
  if (!settings.keys.groq) throw new LlmError(t('llm.groqNeeded'), 'auth')
  const lang = getLang()
  const posts = await getPosts(creator)
  const todo = posts.filter((p) => p.status !== 'done').slice(0, limit)
  const codes = todo.map((p) => p.code)
  const report = (done: number, status: string, step?: Step, event?: RunEvent) =>
    onProgress({ done, total: todo.length, status, codes, current: codes[done], step, event })
  let fatal: LlmError | undefined

  for (const [i, code] of codes.entries()) {
    if (signal.aborted) break
    const p = await getPost(code)
    if (!p) continue
    const label = t('pipe.label', { i: i + 1, n: todo.length })
    const step = (msg: string) => t('pipe.step', { label, msg })
    // 自動等待和換模型的訊息除了顯示在狀態列，也記一筆警告，停下時看得到之前發生了什麼
    const waiting = (s: Step) => (m: string) => report(i, step(m), s, { level: 'warn', text: m, code })
    let downloaded = false
    try {
      await saveThumb(p, signal)
      if (p.transcript === undefined) {
        if (p.audioUrl || p.videoUrl) {
          report(i, step(t('pipe.download')), 'download')
          const audio = await download(p, signal)
          downloaded = true
          report(i, step(t('pipe.transcribe')), 'transcribe')
          p.transcript = await transcribe(settings, audio, waiting('transcribe'), signal)
        } else {
          p.transcript = ''
        }
        await updatePost(code, { transcript: p.transcript, thumb: p.thumb })
      }
      report(i, step(t('pipe.extract')), 'extract')
      const json = parseJson(await generate(settings, digestSystem(lang), digestUser(p.caption, p.transcript), {
        json: true, onWait: waiting('extract'), signal,
      }))
      // 不是物件（例如包在陣列裡）也算格式壞掉：這則算失敗，下次重做，不存成空白的完成
      if (!json || typeof json !== 'object' || Array.isArray(json))
        throw new LlmError(t('llm.badJson', { name: PROVIDER_NAMES[settings.provider] }), 'bad_json')
      p.digest = toDigest(json)
      p.status = 'done'
      p.processedAt = Date.now()
      p.error = undefined
    } catch (e) {
      if (signal.aborted) break
      if (e instanceof LlmError && e.isFatal) {
        fatal = e
        break
      }
      p.status = 'error'
      p.processedAt = Date.now() // 失敗的也記時間，拆解畫面才能估剩餘時間
      p.error = e instanceof Error ? e.message : String(e)
    }
    await updatePost(code, { thumb: p.thumb, transcript: p.transcript, digest: p.digest, status: p.status, processedAt: p.processedAt, error: p.error })
    report(i + 1, step(p.status === 'done' ? t('common.done') : t('pipe.failed', { error: p.error ?? '' })), undefined,
      p.status === 'done' ? { level: 'info', text: t('log.done', { topic: p.digest!.topic }), code } : { level: 'error', text: p.error ?? '', code })
    if (downloaded && i < todo.length - 1)
      await sleep((PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN)) * 1000, signal)
  }

  if (signal.aborted) return
  const kbProgress = (p: Progress) => onProgress({ ...p, codes, step: 'kb' })
  if (fatal) {
    await buildKnowledgeBase(creator, settings, kbProgress, signal).catch(() => {})
    throw fatal
  }
  await buildKnowledgeBase(creator, settings, kbProgress, signal)
  onProgress({ done: 1, total: 1, status: t('common.done'), codes })
}

export async function buildKnowledgeBase(creator: Creator, settings: Settings, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const { posts, use } = await keptPosts(creator)
  if (!use.length) return

  const items = use.map((p, i) => ({ n: i + 1, topic: p.digest!.topic, points: p.digest!.points }))
  const budget = inputBudget(settings.provider)
  const batches: (typeof items)[] = [[]]
  for (const it of items) {
    const cur = batches[batches.length - 1]
    if (cur.length && JSON.stringify([...cur, it]).length > budget) batches.push([])
    batches[batches.length - 1].push(it)
  }

  const total = batches.length + (batches.length > 1 ? 1 : 0)
  let step = 0
  let status = ''
  const say = (m: string) => onProgress({ done: step, total, status: m })

  const cached = await cachedCaller(`kb:${creator.name}`, settings, signal)
  const lang = getLang()
  const call = (user: string) => cached.call(aggregateSystem(lang), user, {
    onStart: () => say(`${status}${t('kb.batchSlow')}`), onWait: (m) => say(`${status}${m}`),
  })
  const tooLarge = (e: unknown) => e instanceof LlmError && e.kind === 'too_large'
  const digestBatch = async (b: typeof items): Promise<string[]> => {
    try {
      return [stripFence(await call(aggregateUser(creator.name, b.length, JSON.stringify(b), lang)))]
    } catch (e) {
      if (!tooLarge(e) || b.length < 2) throw e
      const mid = b.length >> 1
      return [...(await digestBatch(b.slice(0, mid))), ...(await digestBatch(b.slice(mid)))]
    }
  }
  let parts: string[] = []
  for (const [i, b] of batches.entries()) {
    status = batches.length > 1 ? t('kb.batch', { i: i + 1, n: batches.length }) : t('kb.building')
    say(status)
    parts.push(...(await digestBatch(b)))
    step++
  }
  while (parts.length > 1) {
    status = t('kb.merge', { n: parts.length })
    say(status)
    const next: string[] = []
    for (let i = 0; i < parts.length; ) {
      const group = [parts[i++]]
      while (i < parts.length && [...group, parts[i]].join('').length <= budget) group.push(parts[i++])
      if (group.length === 1) next.push(group[0])
      else {
        try {
          next.push(stripFence(await call(mergeUser(creator.name, group, lang))))
        } catch (e) {
          if (!tooLarge(e)) throw e
          next.push(...group)
        }
      }
    }
    if (next.length === parts.length) {
      parts = [parts.join('\n\n')]
      break
    }
    parts = next
  }

  const dropped = posts.length - use.length
  const note = `_${dropped
    ? t('kb.noteDropped', { total: posts.length, dropped, use: use.length }, lang)
    : t('kb.note', { total: posts.length }, lang)}_`
  await saveKnowledgeBase(creator.name, {
    markdown: `${note}\n\n${parts[0]}\n\n${sourceIndex(use)}\n`,
    updatedAt: Date.now(),
    postCount: use.length,
  })
  await cached.clear()
}

export async function keptPosts(creator: Creator) {
  const posts = (await getPosts(creator)).filter((p) => p.status === 'done' && p.digest)
  const kept = posts.filter((p) => p.digest!.value !== '低')
  return { posts, use: kept.length ? kept : posts }
}

export const sourceIndex = (use: Post[], lang: Lang = getLang()) =>
  `## ${t('src.heading', {}, lang)}\n\n${use.map((p, i) => `${i + 1}. ${p.digest!.topic} — [${t('src.view', {}, lang)}](${postUrl(p.code)})`).join('\n')}`

const VALUE_ALIAS: Record<string, Digest['value']> = { 高: '高', 中: '中', 低: '低', high: '高', medium: '中', mid: '中', low: '低' }

export async function cachedCaller(scope: string, settings: Settings, signal?: AbortSignal) {
  const cache = await getCache(scope)
  return {
    async call(system: string, user: string, opts: { json?: boolean; onStart?: () => void; onWait?: (m: string) => void } = {}) {
      const key = hash(system + user)
      if (cache[key] !== undefined) return cache[key]
      opts.onStart?.()
      const out = await generate(settings, system, user, { ...opts, signal })
      cache[key] = out
      await saveCache(scope, cache)
      return out
    },
    async forget(system: string, user: string) {
      delete cache[hash(system + user)]
      await saveCache(scope, cache)
    },
    clear: () => saveCache(scope, null),
  }
}

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `${s.length}-${(h >>> 0).toString(36)}`
}

export function stripFence(md: string) {
  const t = md.trim()
  return t.startsWith('```') ? t.replace(/^```\w*\n?/, '').replace(/```$/, '').trim() : t
}
