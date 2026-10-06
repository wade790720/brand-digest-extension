import { LlmError, generate, inputBudget, parseJson, transcribe } from '@/lib/llm'
import { AGGREGATE_SYSTEM, DIGEST_SYSTEM, aggregateUser, digestUser, mergeUser } from '@/lib/prompts'
import { getPosts, getSettings, saveKnowledgeBase, savePost } from '@/lib/store'
import type { Creator, Digest, Post, Settings } from '@/types'

export interface Progress {
  done: number
  total: number
  status: string // 目前在做什麼，一行
}

// 每則音軌下載之間的停頓（秒）：從 IG 的影片伺服器下載，和播放影片同一種請求，仍保持人的節奏
const PAUSE_MIN = 3
const PAUSE_MAX = 6

const postUrl = (code: string) => `https://www.instagram.com/p/${code}/`

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })
}

function toDigest(raw: any): Digest {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  return {
    topic: String(raw?.topic ?? '（無主題）'),
    points: list(raw?.points),
    quotes: list(raw?.quotes),
    terms: list(raw?.terms),
    value: ['高', '中', '低'].includes(raw?.value) ? raw.value : '中',
  }
}

async function download(p: Post): Promise<Blob> {
  const url = p.audioUrl ?? p.videoUrl!
  const res = await fetch(url, { credentials: 'omit' }) // 不帶 IG 登入狀態
  if (res.status === 403 || res.status === 410)
    throw new Error('影片連結已過期。回到博主主頁重新往下滑到這則，再按一次萃取。')
  if (!res.ok) throw new Error(`下載失敗（HTTP ${res.status}）`)
  return res.blob()
}

/** 處理一位博主所有還沒完成的貼文：下載音軌 → 轉錄 → 萃取，最後整合成知識庫。
 *  金鑰錯誤、額度用完會停下整批（拋出 LlmError）；單則失敗只記在那一則，繼續下一則。 */
export async function processCreator(creator: Creator, signal: AbortSignal, onProgress: (p: Progress) => void) {
  const settings = await getSettings()
  if (!settings.keys.groq) throw new LlmError('轉錄需要 Groq 金鑰（免費），請先到設定填寫。', 'auth')
  const posts = await getPosts(creator)
  const todo = posts.filter((p) => p.status !== 'done')
  const report = (done: number, status: string) => onProgress({ done, total: todo.length, status })

  for (const [i, p] of todo.entries()) {
    if (signal.aborted) break
    const label = `第 ${i + 1}/${todo.length} 則`
    let downloaded = false
    try {
      if (p.transcript === undefined) {
        if (p.audioUrl || p.videoUrl) {
          report(i, `${label}：下載音軌…`)
          const audio = await download(p)
          downloaded = true
          report(i, `${label}：轉錄…`)
          p.transcript = await transcribe(settings, audio)
        } else {
          p.transcript = '' // 圖片貼文：只用文案
        }
        await savePost(p) // 轉錄先存：萃取失敗時下次不用重新下載、轉錄
      }
      report(i, `${label}：萃取重點…`)
      const raw = await generate(settings, DIGEST_SYSTEM, digestUser(p.caption, p.transcript), {
        json: true, onWait: (m) => report(i, `${label}：${m}`),
      })
      p.digest = toDigest(parseJson(raw))
      p.status = 'done'
      p.error = undefined
    } catch (e) {
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'quota')) throw e
      p.status = 'error'
      p.error = e instanceof Error ? e.message : String(e)
    }
    await savePost(p)
    report(i + 1, `${label}：${p.status === 'done' ? '完成' : `失敗：${p.error}`}`)
    if (downloaded && i < todo.length - 1)
      await sleep((PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN)) * 1000, signal)
  }

  if (signal.aborted) return
  report(todo.length, '整合知識庫…')
  await buildKnowledgeBase(creator, settings, (m) => report(todo.length, m))
  report(todo.length, '完成')
}

/** 跨篇整合成知識庫。內容超過模型一次能收的量，就分批整理再合併（Groq 免費方案需要）。 */
export async function buildKnowledgeBase(creator: Creator, settings: Settings, onStatus: (m: string) => void) {
  const posts = (await getPosts(creator)).filter((p) => p.status === 'done' && p.digest)
  const kept = posts.filter((p) => p.digest!.value !== '低')
  const use = kept.length ? kept : posts
  if (!use.length) return

  // 只送主題與知識點：金句、名詞不進知識庫，省 token
  const items = use.map((p, i) => ({ n: i + 1, topic: p.digest!.topic, points: p.digest!.points }))
  const budget = inputBudget(settings.provider)
  const batches: (typeof items)[] = [[]]
  for (const it of items) {
    const cur = batches[batches.length - 1]
    if (cur.length && JSON.stringify([...cur, it]).length > budget) batches.push([])
    batches[batches.length - 1].push(it)
  }

  const call = (user: string) => generate(settings, AGGREGATE_SYSTEM, user, { onWait: onStatus })
  let parts: string[] = []
  for (const [i, b] of batches.entries()) {
    onStatus(batches.length > 1 ? `整合知識庫：第 ${i + 1}/${batches.length} 批…` : '整合知識庫…')
    parts.push(stripFence(await call(aggregateUser(creator.name, b.length, JSON.stringify(b)))))
  }
  // 分批的結果再合併，直到剩一份（每次合併也不能超過上限）
  while (parts.length > 1) {
    onStatus(`合併 ${parts.length} 份分批結果…`)
    const next: string[] = []
    for (let i = 0; i < parts.length; ) {
      const group = [parts[i++]]
      while (i < parts.length && [...group, parts[i]].join('').length <= budget) group.push(parts[i++])
      next.push(group.length === 1 ? group[0] : stripFence(await call(mergeUser(creator.name, group))))
    }
    if (next.length === parts.length) {
      parts = [parts.join('\n\n')] // 每份都太大、無法再合：直接接起來，至少不遺失內容
      break
    }
    parts = next
  }

  const dropped = posts.length - use.length
  const note = `_共 ${posts.length} 則${dropped ? `，篩掉 ${dropped} 則低含金量後整合 ${use.length} 則` : ''}_`
  const index = use.map((p, i) => `${i + 1}. ${p.digest!.topic} — [看原文](${postUrl(p.code)})`).join('\n')
  await saveKnowledgeBase(creator.name, {
    markdown: `${note}\n\n${parts[0]}\n\n## 來源索引\n\n${index}\n`,
    updatedAt: Date.now(),
    postCount: use.length,
  })
}

function stripFence(md: string) {
  const t = md.trim()
  return t.startsWith('```') ? t.replace(/^```\w*\n?/, '').replace(/```$/, '').trim() : t
}
