// 腳本拆解：分析主播「怎麼說」（hook、腳本結構、CTA、文案公式、說服手法），不是「說什麼」。
// 1. 逐則拆解：每則一次 AI 請求，結果存在貼文上（post.script），之後不重做
// 2. 數據表：程式依 hook 類型算平均播放、按讚，不交給 AI 算
// 3. 整合：AI 把所有拆解歸納成這位主播的寫法手冊，附可以直接套用的模板

import { getLang, hookTypeLabel, t, type Key, type Lang } from '@/lib/i18n'
import { LlmError, generate, inputBudget, parseJson } from '@/lib/llm'
import { cachedCaller, sourceIndex, stripFence, type Progress } from '@/lib/pipeline'
import { getPosts, getSettings, savePlaybook, savePost } from '@/lib/store'
import type { Creator, Post, ScriptBreakdown } from '@/types'

export const HOOK_TYPES = ['提問', '反常識', '數字清單', '痛點', '故事開場', '身分喊話', '結果先行', '爭議觀點', '其他']
const CTA_TYPES = ['留言關鍵字', '追蹤', '私訊', '點連結', '分享收藏', '購買', '無']

const breakdownSystem = (lang: Lang) => `你是短影音腳本與文案分析師。只分析「怎麼說」：結構、話術、說服手法，不整理知識內容。
${t('ai.lang', {}, lang)}只回傳 JSON。hookType 和 ctaType 一定照抄下面清單裡的中文原字，不要翻譯（程式用它統計）。`

const breakdownUser = (caption: string, transcript: string) => `分析這則短影音的腳本與文案寫法，回傳 JSON：
{
  "hook": "開頭第一句原文（逐字稿沒有就用貼文文字第一句）",
  "hookType": "從這些選一個：${HOOK_TYPES.join('、')}",
  "beats": [{"role": "這段的作用，例如：Hook、痛點、觀點、證據、案例、轉折、方法、CTA", "text": "這段的重點，一句話"}],
  "cta": "結尾要觀眾做什麼，原文；沒有就空字串",
  "ctaType": "從這些選一個：${CTA_TYPES.join('、')}",
  "captionFormula": "貼文文字的寫法，一句話（例如：痛點 → 解法 → CTA 的 PAS 結構）",
  "techniques": ["用到的說服手法，例如：社會認同、稀缺、權威、對比、故事、具體數字"]
}

【影片逐字稿】
${transcript.trim() || '（無）'}

【貼文文字】
${caption.trim() || '（無）'}`

const playbookSystem = (lang: Lang) => `你是短影音內容策略顧問，擅長從一位創作者的大量作品歸納出可以複製的寫法。
${t('ai.lang', {}, lang)}輸出 Markdown，不要包程式碼圍欄。`

const sections = (lang: Lang) => {
  const h = (k: Key) => t(k, {}, lang)
  return `章節固定為（用 ## 標題，標題文字照抄）：

## ${h('script.hSummary')}
## ${h('script.hHooks')}
## ${h('script.hStructure')}
## ${h('script.hCta')}
## ${h('script.hPersuasion')}
## ${h('script.hTodo')}

要求：
- 「${h('script.hHooks')}」：歸納 3–5 種，每種寫：名稱、為什麼有效、原句範例 [編號]、可以直接套用的填空模板（例如「你知道為什麼＿＿＿嗎？」）。
- 「${h('script.hStructure')}」：1–3 種，用 → 串起各段，寫出適用情境，附範例 [編號]。
- 有播放數（plays）或按讚數（likes）時，優先歸納表現好的作品，並說明依據。沒有數字就不要編。
- 「${h('script.hTodo')}」用勾選框格式（- [ ]）。
- 出處一律寫成 [編號]，例如 [10] 或 [3][7]，不要寫成 n10、【n10】。編號只能用資料裡出現過的 n 值。`
}

const playbookUser = (creator: string, count: number, items: string, lang: Lang) =>
  `以下是「${creator}」共 ${count} 則短影音的腳本拆解（JSON，每則有 n 編號）。請歸納成一份「寫法手冊」，${sections(lang)}

【各則拆解】
${items}`

const mergeUser = (creator: string, parts: string[], lang: Lang) =>
  `以下是「${creator}」的寫法手冊，因為作品太多分成 ${parts.length} 批整理。請合併成一份，相同的模式合併成一條、保留所有 [編號]，${sections(lang)}

${parts.map((p, i) => `【第 ${i + 1} 批】\n${p}`).join('\n\n')}`

/** AI 回的拆解 JSON 欄位可能缺、型別可能不對，整理成固定格式。連 hook 都沒有就當作失敗 */
export function toBreakdown(raw: any): ScriptBreakdown | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const hook = str(raw?.hook)
  if (!hook) return null
  const pick = (v: unknown, list: string[]) => (list.includes(str(v)) ? str(v) : list[list.length - 1])
  return {
    hook,
    hookType: pick(raw.hookType, HOOK_TYPES),
    beats: (Array.isArray(raw.beats) ? raw.beats : [])
      .map((b: any) => ({ role: str(b?.role), text: str(b?.text) })).filter((b: { role: string }) => b.role),
    cta: str(raw.cta),
    ctaType: pick(raw.ctaType, CTA_TYPES),
    captionFormula: str(raw.captionFormula),
    techniques: (Array.isArray(raw.techniques) ? raw.techniques : []).map(str).filter(Boolean),
  }
}

/** 依 hook 類型統計：則數、平均播放、平均按讚。只算有數字的貼文，依平均播放（沒有就按讚）由高到低 */
export function hookStats(posts: Post[]) {
  const groups = new Map<string, Post[]>()
  for (const p of posts) if (p.script) groups.set(p.script.hookType, [...(groups.get(p.script.hookType) ?? []), p])
  const avg = (ps: Post[], k: 'plays' | 'likes') => {
    const vs = ps.map((p) => p.stats?.[k]).filter((v): v is number => v !== undefined)
    return vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : undefined
  }
  return [...groups].map(([type, ps]) => ({ type, count: ps.length, plays: avg(ps, 'plays'), likes: avg(ps, 'likes') }))
    .sort((a, b) => (b.plays ?? b.likes ?? -1) - (a.plays ?? a.likes ?? -1))
}

/** 數據表 Markdown。沒有任何互動數字就回傳空字串 */
export function statsTable(rows: ReturnType<typeof hookStats>, lang: Lang = getLang()) {
  if (!rows.some((r) => r.plays !== undefined || r.likes !== undefined)) return ''
  const n = (v?: number) => (v === undefined ? '—' : v.toLocaleString('zh-TW'))
  return [
    `## ${t('script.statsHeading', {}, lang)}`,
    '',
    t('script.statsHead', {}, lang),
    '|---|---|---|---|',
    ...rows.map((r) => `| ${hookTypeLabel(r.type, lang)} | ${r.count} | ${n(r.plays)} | ${n(r.likes)} |`),
    '',
    `_${t('script.statsNote', {}, lang)}_`,
  ].join('\n')
}

/** 逐則拆解（已拆過的跳過），再整合成寫法手冊並存檔。額度或金鑰問題會停下整批（拋出 LlmError） */
export async function buildPlaybook(creator: Creator, signal: AbortSignal, onProgress: (p: Progress) => void) {
  const settings = await getSettings()
  const lang = getLang() // 這次產出的語言：開始時的介面語言
  const posts = (await getPosts(creator)).filter((p) => p.status === 'done' && (p.transcript || p.caption))
  if (!posts.length) throw new Error(t('script.noPosts', { name: creator.name }))
  const todo = posts.filter((p) => !p.script)

  for (const [i, p] of todo.entries()) {
    if (signal.aborted) return
    const label = t('script.label', { i: i + 1, n: todo.length })
    onProgress({ done: i, total: todo.length + 1, status: `${label}…` })
    try {
      const raw = await generate(settings, breakdownSystem(lang), breakdownUser(p.caption, p.transcript ?? ''), {
        json: true, onWait: (m) => onProgress({ done: i, total: todo.length + 1, status: `${label}：${m}` }),
      })
      const b = toBreakdown(parseJson(raw))
      if (b) await savePost({ ...p, script: b }) // 格式壞掉的這則先略過，下次再拆
    } catch (e) {
      if (e instanceof LlmError && ['auth', 'quota', 'model', 'rate', 'overload'].includes(e.kind)) throw e
    }
  }
  if (signal.aborted) return

  const use = (await getPosts(creator)).filter((p) => p.script)
  if (!use.length) throw new Error(t('script.noneOk'))
  const items = use.map((p, i) => ({
    n: i + 1,
    hookType: p.script!.hookType,
    hook: p.script!.hook.slice(0, 80),
    beats: p.script!.beats.map((b) => b.role).join(' → '),
    cta: p.script!.cta.slice(0, 50),
    ctaType: p.script!.ctaType,
    captionFormula: p.script!.captionFormula.slice(0, 60),
    techniques: p.script!.techniques,
    ...(p.stats?.plays !== undefined && { plays: p.stats.plays }),
    ...(p.stats?.likes !== undefined && { likes: p.stats.likes }),
  }))

  // 內容超過模型一次能收的量就分批，再合併（同知識庫的做法）
  const budget = inputBudget(settings.provider)
  const batches: (typeof items)[] = [[]]
  for (const it of items) {
    const cur = batches[batches.length - 1]
    if (cur.length && JSON.stringify([...cur, it]).length > budget) batches.push([])
    batches[batches.length - 1].push(it)
  }
  const total = todo.length + batches.length + (batches.length > 1 ? 1 : 0)
  let step = todo.length
  const cached = await cachedCaller(`script:${creator.name}`, settings)
  const ask = (status: string, user: string) => {
    onProgress({ done: step, total, status })
    return cached.call(playbookSystem(lang), user, { onWait: (m) => onProgress({ done: step, total, status: `${status}${m}` }) })
  }

  let parts: string[] = []
  for (const [i, b] of batches.entries()) {
    if (signal.aborted) return
    const status = batches.length > 1 ? t('script.batch', { i: i + 1, n: batches.length }) : t('script.building')
    parts.push(stripFence(await ask(status, playbookUser(creator.name, b.length, JSON.stringify(b), lang))))
    step++
  }
  // ponytail: 分批結果合併一次就好；一次合不下就直接接起來（同知識庫的上限），要更好請換上限大的模型
  if (parts.length > 1) {
    const merged = parts.join('').length <= budget ? stripFence(await ask(t('script.merge'), mergeUser(creator.name, parts, lang))) : null
    parts = [merged ?? parts.join('\n\n')]
  }

  const table = statsTable(hookStats(use), lang)
  const note = `_${t('script.note', { n: use.length }, lang)}_`
  await savePlaybook(creator.name, {
    markdown: [note, table, parts[0], sourceIndex(use, lang)].filter(Boolean).join('\n\n') + '\n',
    updatedAt: Date.now(),
    postCount: use.length,
  })
  await cached.clear()
  onProgress({ done: total, total, status: t('common.done') })
}
