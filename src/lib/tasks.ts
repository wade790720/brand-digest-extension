// 知識庫「可行動清單」的勾選項目（Markdown 的 - [ ] 項目）。
// 用項目原文當識別：重新整合知識庫後，文字沒變的項目仍保留勾選。

const TASK = /^\s*[-*+] \[[ xX]\] (.+)$/

/** 一行 Markdown 是勾選項目就回傳它的識別（項目原文），不是就回傳 null */
export function taskKey(line: string | undefined): string | null {
  return line?.match(TASK)?.[1].trim() ?? null
}

/** 整份 Markdown 裡所有勾選項目的識別，依出現順序，不重複 */
export const taskKeys = (md: string) => [...new Set(md.split('\n').map(taskKey).filter((k): k is string => !!k))]

/** 知識庫第一個章節（這個創作者在教什麼）的第一段，去掉出處 [n] 和粗體，給儀表板當一句話摘要 */
export function teachLine(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## '))
  if (start < 0) return ''
  const first = lines.slice(start + 1).find((l) => l.trim() && !l.startsWith('#'))
  return (first ?? '').replace(/^\s*[-*+]\s+/, '').replace(/\[\d+\]/g, '').replace(/\*\*/g, '').trim()
}
