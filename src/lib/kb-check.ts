import { normalizeCites } from '@/lib/cites'
import { t, type Lang } from '@/lib/i18n'

const SECTIONS = ['kb.hTeach', 'kb.hMethod', 'kb.hClusters', 'kb.hActions'] as const

/** 程式檢查 AI 寫的知識庫：模型有時漏章節、編號寫錯、行動清單沒用勾選框，或整段貼文沒寫進去 */
export interface KbReview {
  missing: string[]
  badCites: number[]
  noTasks: boolean
  uncited: number[]
}

export function reviewKb(md: string, count: number, lang: Lang): KbReview {
  const heads = new Set([...md.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/[*_]/g, '').trim()))
  const cited = new Set([...normalizeCites(md).matchAll(/\[(\d{1,4})\]/g)].map((m) => Number(m[1])))
  return {
    missing: SECTIONS.map((k) => t(k, {}, lang)).filter((h) => !heads.has(h)),
    badCites: [...cited].filter((n) => n < 1 || n > count).sort((a, b) => a - b),
    noTasks: !/^\s*[-*+] \[[ xX]\] /m.test(md),
    uncited: Array.from({ length: count }, (_, i) => i + 1).filter((n) => !cited.has(n)),
  }
}

// ponytail: 超過三成沒引用才算問題；少量沒引用多半是內容重複，被合併掉是對的
const tooManyUncited = (r: KbReview, count: number) => count >= 10 && r.uncited.length / count > 0.3

export const needsFix = (r: KbReview, count: number) => !!(r.missing.length || r.badCites.length || r.noTasks || tooManyUncited(r, count))

/** 修正版比較好才採用：章節最重要，其次是錯的編號和勾選框，最後是沒引用的貼文 */
export const badness = (r: KbReview) => r.missing.length * 1000 + r.badCites.length * 50 + (r.noTasks ? 200 : 0) + r.uncited.length

export function fixNotes(r: KbReview, count: number, lang: Lang, withMissed: boolean): string[] {
  const h = (k: (typeof SECTIONS)[number]) => t(k, {}, lang)
  return [
    ...r.missing.map((name) => `缺少章節「${name}」，請補上。`),
    ...(r.badCites.length ? [`這些編號不存在：${r.badCites.map((n) => `[${n}]`).join('')}。編號只能是 1 到 ${count}，改成正確的編號或刪掉。`] : []),
    ...(r.noTasks ? [`「${h('kb.hActions')}」的每一項要用勾選框格式（- [ ]）。`] : []),
    ...(withMissed && tooManyUncited(r, count) ? ['下面「還沒整合的貼文」的知識點，合併進對應的章節，並標上它們的編號。'] : []),
  ]
}
