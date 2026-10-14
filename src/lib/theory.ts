// 理論對位：把碎片化的乾貨掛到既有理論上，組成可用的公式。移植自 Python 版 brand-digest 的 pipeline/theory.py。
//
// 和知識庫的差別：知識庫由下往上分群；這裡上下夾擊：
//   1. 骨架：AI 依主題列出既有理論與子原則（使用者可以改了再跑）
//   2. 對位：每條乾貨掛到子原則；掛不上的是「獨門心法」，和理論衝突的記下來
//   3. 組裝：每個理論把多則碎片合成公式，附理論機制與適用條件，最後一份總結
// 另外用程式算「飽和曲線」：依發文時間，第幾則之後就不再出現新觀念。

import { getLang, t, type Lang } from '@/lib/i18n'
import { generate, inputBudget, parseJson } from '@/lib/llm'
import { cachedCaller, keptPosts, sourceIndex, stripFence, type Progress } from '@/lib/pipeline'
import { getSettings, saveTheory } from '@/lib/store'
import type { Creator, Theory } from '@/types'

const skeletonSystem = (lang: Lang) => `你是行銷、銷售心理學與溝通理論的專家。${t('ai.lang', {}, lang)}只回傳 JSON。`

const skeletonUser = (topic: string, topics: string) => `我要研究一位創作者在「${topic}」上的經驗。以下是這位創作者各則內容的主題：
${topics}

請列出 6–9 個和這些內容最相關、公認的既有理論或框架（行銷、銷售、心理學、溝通、直播／內容經營皆可），
每個理論拆 2–4 條子原則。回傳 JSON：
{"theories":[{"name":"理論名稱","source":"提出者或來源","claim":"一句話核心主張","principles":["子原則，一句話"]}]}`

const mapSystem = (lang: Lang) => `你負責把創作者的零碎經驗對位到理論上。判斷要嚴格：只有機制真的相同才算對位。
${t('ai.lang', {}, lang)}只回傳 JSON。`

const mapUser = (skeleton: string, fragments: string) => `【理論骨架】每行「子原則id 名稱」
${skeleton}

【碎片】每條格式「碎片id：內容」，碎片id 是「則編號-條序」
${fragments}

把每條碎片歸類，回傳 JSON：
{"mapped": {"子原則id": ["碎片id", ...]},
 "unique": [{"ids": ["碎片id", ...], "point": "理論沒涵蓋的觀念，一句話"}],
 "conflicts": [{"ids": ["碎片id"], "node": "子原則id", "note": "創作者的做法和理論哪裡不同"}]}
規則：一條碎片可以對位多個子原則；對不上任何子原則的，相近的歸成同一個 unique 群組；
純技術細節或太空泛的碎片可以略過。`

const synthSystem = (lang: Lang) => `你是知識體系建構專家，擅長把零碎經驗組成可以照著做的公式。
${t('ai.lang', {}, lang)}輸出 Markdown，不要包程式碼圍欄。`

// 組裝拆成「每個理論一次」＋「總結一次」：單次請求小，免費方案（例如 Groq 每分鐘 8000 token）也跑得動
const CITE_RULE = '[編號] 是「則編號」（碎片id 橫線前的數字），只能用資料裡出現過的，例如 [3][17]。'

const theoryUser = (creator: string, topic: string, th: Theory, mapped: string, lang: Lang) =>
  `創作者「${creator}」在「${topic}」上的經驗，已經對位到「${th.name}」（${th.source}）。
從「### ${th.name}」開始輸出。每個子原則寫成（粗體標籤文字照抄）：
**子原則名稱**
- ${t('theory.fFormula', {}, lang)}：可以照著做的步驟（1. 2. 3.）
- ${t('theory.fHow', {}, lang)}：整合多則碎片的具體做法，標出處 [編號]
- ${t('theory.fWhy', {}, lang)}：理論機制，一到兩句
- ${t('theory.fWhen', {}, lang)}：什麼情況下用、什麼情況會失效
${CITE_RULE}

【對位到這個理論的碎片】
${mapped}`

const summaryUser = (creator: string, topic: string, nodes: string, unique: string, conflicts: string, gaps: string, lang: Lang) =>
  `創作者「${creator}」在「${topic}」上的經驗已對位到理論。輸出以下章節（## 標題，標題文字照抄）：

## ${t('theory.hSummary', {}, lang)}
用一個公式或流程，串起創作者最常講的節點（括號內是碎片數，越多代表越常講）。

## ${t('theory.hUnique', {}, lang)}
理論沒涵蓋、創作者自己的觀念。每條寫：觀念、創作者的做法 [編號]、你推測它為什麼有效。

## ${t('theory.hDiff', {}, lang)}
沒有就寫「${t('common.none', {}, lang)}」。

## ${t('theory.hMissing', {}, lang)}
下面沒有任何碎片對應的子原則，挑最值得補的 3 條，各一句說明為什麼值得補。
${CITE_RULE}

【講過的節點】
${nodes}

【獨門】
${unique}

【矛盾】
${conflicts}

【沒有碎片的子原則】
${gaps}`

/** 每批最多幾條碎片。上限大的模型也不要一次全送：一批太多，對位判斷會變粗 */
const MAP_BATCH_MAX = 300

export interface Mapping {
  mapped: Record<string, string[]>
  unique: { ids: string[]; point: string }[]
  conflicts: { ids: string[]; node: string; note: string }[]
}

// —— 不呼叫 AI 的部分（theory.test.ts 有測） ——

/** 給使用者編輯的純文字格式：一行理論「名稱｜出處」，底下每行「- 子原則」，理論之間空一行。 */
export const skeletonToText = (sk: Theory[]) =>
  sk.map((t) => [t.name + (t.source ? `｜${t.source}` : ''), ...t.principles.map((p) => `- ${p.name}`)].join('\n')).join('\n\n')

/** skeletonToText 的反向。id 依順序重新編。沒列子原則的理論，用理論本身當唯一的子原則，才有地方對位。 */
export function textToSkeleton(text: string): Theory[] {
  const raw: { name: string; source: string; principles: string[] }[] = []
  for (const line of text.split('\n').map((l) => l.trim())) {
    if (!line) continue
    if ('-–•*'.includes(line[0])) {
      const name = line.replace(/^[-–•*\s]+/, '').trim()
      if (name && raw.length) raw[raw.length - 1].principles.push(name)
    } else {
      const [name, ...rest] = line.split('｜')
      raw.push({ name: name.trim(), source: rest.join('｜').trim(), principles: [] })
    }
  }
  if (!raw.length) throw new Error(t('theory.empty'))
  return raw.map((t, i) => ({
    id: `T${i + 1}`, name: t.name, source: t.source,
    principles: (t.principles.length ? t.principles : [t.name]).map((name, j) => ({ id: `T${i + 1}.${j + 1}`, name })),
  }))
}

/** 整理 AI 輸出的 Markdown。subLevel：理論小節裡，第一行以外的標題（子原則）一律降成 ####。 */
export function cleanMd(raw: string, subLevel = false) {
  // AI 常把出處寫成碎片id（[3-2] 或表格裡的 3‑2），改回則編號 [3]
  let md = stripFence(raw)
    .replace(/\[(\d+)[-‑–]\d+\]/g, '[$1]')
    .replace(/(?<![[\d.\-‑–])(\d{1,3})[-‑–]\d{1,2}(?=[：:，、）)\s])/g, '[$1]')
  if (subLevel) {
    const [first, ...rest] = md.split('\n')
    md = [first, ...rest.map((l) => l.replace(/^#{1,4}\s+\**(.+?)\**\s*$/, '#### $1'))].join('\n')
  }
  return md
}

/** 依發文時間順序，每多看一則，累計出現過幾個不同的觀念（子原則＋獨門群組）。曲線變平＝後面在重複前面講過的。
 *  takenAt[n-1] 是第 n 則的發文時間。 */
export function saturation(takenAt: number[], m: Mapping): number[] {
  const concepts = new Map<string, Set<string>>()
  const add = (fid: string, c: string) => {
    const n = fid.split('-')[0]
    if (!concepts.has(n)) concepts.set(n, new Set())
    concepts.get(n)!.add(c)
  }
  for (const [node, ids] of Object.entries(m.mapped)) ids.forEach((f) => add(f, node))
  m.unique.forEach((g, k) => g.ids.forEach((f) => add(f, `U${k}`)))
  const order = takenAt.map((_, i) => i + 1).sort((a, b) => takenAt[a - 1] - takenAt[b - 1])
  const seen = new Set<string>()
  return order.map((n) => (concepts.get(String(n))?.forEach((c) => seen.add(c)), seen.size))
}

export function saturationNote(curve: number[], lang: Lang = getLang()) {
  const last = curve[curve.length - 1]
  if (!last) return ''
  const at80 = curve.findIndex((c) => c >= last * 0.8) + 1
  return `_${t('theory.saturation', { at80, pct: Math.floor((at80 * 100) / curve.length), n: curve.length, last }, lang)}_`
}

/** AI 回的對位 JSON 欄位可能缺、型別可能不對，整理成固定格式 */
function toMapping(raw: any): Mapping {
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  const mapped: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw?.mapped ?? {})) mapped[k] = ids(v)
  return {
    mapped,
    unique: (Array.isArray(raw?.unique) ? raw.unique : []).map((g: any) => ({ ids: ids(g?.ids), point: String(g?.point ?? '') })),
    conflicts: (Array.isArray(raw?.conflicts) ? raw.conflicts : [])
      .map((c: any) => ({ ids: ids(c?.ids), node: String(c?.node ?? ''), note: String(c?.note ?? '') })),
  }
}

/** 文字超過上限就從後面截掉整行，最後註明。給送不進一次請求的長清單用。 */
export function fit(lines: string[], max: number) {
  let out = ''
  for (const [i, l] of lines.entries()) {
    if (out.length + l.length + 1 > max) return `${out}（還有 ${lines.length - i} 項，篇幅限制略過）`
    out += `${l}\n`
  }
  return out.trimEnd()
}

// —— 呼叫 AI 的部分 ——

/** 不填主題時存的是「全部內容」（資料裡的固定值），給 AI 和文件看的要換成目前語言 */
const topicName = (topic: string, lang: Lang) => (topic === '全部內容' ? t('theory.all', {}, lang) : topic)

/** 請 AI 依主題提出理論骨架。不存檔：使用者確認或修改後才存。 */
export async function proposeSkeleton(creator: Creator, topic: string): Promise<Theory[]> {
  const settings = await getSettings()
  const { use } = await keptPosts(creator)
  if (!use.length) throw new Error(t('theory.noDigest', { name: creator.name }))
  const topics = fit(use.map((p) => `- ${p.digest!.topic}`), inputBudget(settings.provider) - 600)
  const lang = getLang()
  const data = parseJson(await generate(settings, skeletonSystem(lang), skeletonUser(topicName(topic, lang), topics), { json: true }))
  const list = Array.isArray(data) ? data : data?.theories
  if (!Array.isArray(list) || !list.length) throw new Error(t('theory.badSkeleton'))
  // 走一次文字格式：順便編好 id、補上沒列子原則的理論
  return textToSkeleton(list.map((th: any) => [
    `${th?.name ?? ''}${th?.source ? `｜${th.source}` : ''}`,
    ...(Array.isArray(th?.principles) ? th.principles : []).map((p: any) => `- ${typeof p === 'string' ? p : p?.name ?? ''}`),
  ].join('\n')).join('\n\n'))
}

/** 產生理論對位版並存檔。每次 AI 回應都先暫存，額度在半路用完時，下次從停下的地方繼續。 */
export async function buildTheory(creator: Creator, topic: string, skeleton: Theory[], signal: AbortSignal, onProgress: (p: Progress) => void) {
  const settings = await getSettings()
  const lang = getLang() // 這次產出的語言：開始時的介面語言
  const shownTopic = topicName(topic, lang)
  const { use } = await keptPosts(creator)
  const frags: Record<string, string> = {}
  use.forEach((p, i) => p.digest!.points.forEach((g, j) => (frags[`${i + 1}-${j + 1}`] = g)))
  if (!Object.keys(frags).length) throw new Error(t('theory.noPoints', { name: creator.name }))

  const budget = inputBudget(settings.provider)
  const skText = skeleton.map((t) => [`${t.id} ${t.name}`, ...t.principles.map((p) => `  ${p.id} ${p.name}`)].join('\n')).join('\n')
  // 碎片分批對位：一次全送會超過模型上限；分批送內容少，判斷也比較準
  const room = Math.max(budget - skText.length - 800, 1000)
  const batches: string[][] = [[]]
  for (const [k, v] of Object.entries(frags)) {
    const cur = batches[batches.length - 1]
    if (cur.length >= MAP_BATCH_MAX || (cur.length && cur.join('\n').length + k.length + v.length + 2 > room)) batches.push([])
    batches[batches.length - 1].push(`${k}：${v}`)
  }

  let step = 0
  let total = batches.length + skeleton.length + 1 // 對位完才知道幾個理論有碎片，到時再修正
  const say = (status: string) => onProgress({ done: step, total, status })
  const cached = await cachedCaller(`theory:${creator.name}:${topic}`, settings)
  const ask = (status: string, system: string, user: string, json = false) =>
    cached.call(system, user, { json, onStart: () => say(status), onWait: (m) => say(`${status}${m}`) })

  // ponytail: 不同批次可能各自產生意思相近的獨門群組，目前不合併；飽和度會因此略偏高
  const m: Mapping = { mapped: {}, unique: [], conflicts: [] }
  for (const [i, b] of batches.entries()) {
    if (signal.aborted) return
    const status = t('theory.mapBatch', { i: i + 1, n: batches.length })
    say(status)
    const user = mapUser(skText, b.join('\n'))
    const raw = parseJson(await ask(status, mapSystem(lang), user, true))
    if (!raw) await cached.forget(mapSystem(lang), user) // 格式壞掉：這批略過，下次重新問
    const part = toMapping(raw)
    for (const [node, ids] of Object.entries(part.mapped)) (m.mapped[node] ??= []).push(...ids)
    m.unique.push(...part.unique)
    m.conflicts.push(...part.conflicts)
    step++
  }

  const names: Record<string, string> = {}
  for (const t of skeleton) for (const p of t.principles) names[p.id] = `${p.name}（${t.name}）`
  // AI 偶爾會編出骨架沒有的節點 id、或不存在的碎片 id，直接丟掉
  const hits: Record<string, string[]> = {}
  for (const [n, ids] of Object.entries(m.mapped)) if (names[n]) hits[n] = [...new Set(ids.filter((f) => frags[f]))]
  const uniqueIds = m.unique.flatMap((g) => g.ids).filter((f) => frags[f])
  if (!Object.values(hits).some((ids) => ids.length) && !uniqueIds.length) {
    await cached.clear()
    throw new Error(t('theory.badMap'))
  }

  const mine = skeleton.map((th) => ({ th, ps: th.principles.filter((p) => hits[p.id]?.length) })).filter((x) => x.ps.length)
  total = batches.length + mine.length + 1
  const sections: string[] = []
  for (const [i, { th, ps }] of mine.entries()) {
    if (signal.aborted) return
    // ponytail: 碎片太多送不進一次請求時，每個子原則截掉後面的碎片；要全收就得再分批組裝
    let cap = Math.max(...ps.map((p) => hits[p.id].length))
    const mapped = () => ps.map((p) => `[${p.name}]\n${hits[p.id].slice(0, cap).map((f) => `  - ${f}：${frags[f]}`).join('\n')}`).join('\n')
    while (cap > 3 && mapped().length > budget - 1200) cap = Math.floor(cap * 0.8)
    const status = t('theory.synth', { name: th.name, i: i + 1, n: mine.length })
    say(status)
    sections.push(cleanMd(await ask(status, synthSystem(lang), theoryUser(creator.name, shownTopic, th, mapped(), lang)), true))
    step++
  }

  if (signal.aborted) return
  const room2 = (budget - 1500) / 3
  const nodes = Object.entries(hits).filter(([, ids]) => ids.length).sort((a, b) => b[1].length - a[1].length)
    .map(([n, ids]) => `- ${names[n]}（${ids.length}）`)
  const unique = m.unique.map((g) => [`- ${g.point}`, ...g.ids.filter((f) => frags[f]).map((f) => `  - ${f}：${frags[f]}`)].join('\n'))
  const conflicts = m.conflicts.map((c) => `- [${c.node}] ${c.note}（${c.ids.join(', ')}）`)
  const gaps = Object.keys(names).filter((n) => !hits[n]?.length).map((n) => `- ${names[n]}`)
  say(t('theory.summaryStep'))
  const summary = cleanMd(await ask(t('theory.summaryStep'), synthSystem(lang), summaryUser(creator.name, shownTopic,
    fit(nodes, room2), fit(unique, room2) || '（無）', fit(conflicts, room2) || '（無）', fit(gaps, 1500) || '（無）', lang)))

  // 總結裡「獨門心法」之前的段落放最前面，理論小節插在中間（標題用這次產出的語言）
  const uniqueH = `## ${t('theory.hUnique', {}, lang)}`
  const [head, ...tail] = summary.split(uniqueH)
  const md = `${head.trim()}\n\n## ${t('theory.hMapped', {}, lang)}\n\n${sections.join('\n\n')}` +
    (tail.length ? `\n\n${uniqueH}${tail.join(uniqueH)}` : '')
  const used = new Set([...Object.values(hits).flat(), ...uniqueIds])
  const stats = `_${t('theory.stats', {
    topic: shownTopic, posts: use.length, frags: Object.keys(frags).length, used: used.size,
    principles: Object.keys(names).length, hit: Object.keys(names).length - gaps.length,
  }, lang)}_`
  const note = saturationNote(saturation(use.map((p) => p.takenAt), { ...m, mapped: hits }), lang)

  await saveTheory(creator.name, { topic, skeleton, markdown: `${stats}\n\n${note}\n\n${md}\n\n${sourceIndex(use, lang)}\n`, updatedAt: Date.now() })
  await cached.clear()
  onProgress({ done: total, total, status: t('common.done') })
}
