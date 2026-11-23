import { t, type Key, type Lang } from '@/lib/i18n'

/** 內容顏色的意思：重點、做法、要照做的事、要留意的差異，來源不上色 */
export type Tone = 'key' | 'method' | 'action' | 'caution' | 'source'

const TONES: [Tone, Key[]][] = [
  ['key', ['kb.hTeach', 'script.hSummary', 'theory.hSummary', 'theory.hUnique']],
  ['method', ['kb.hMethod', 'kb.hClusters', 'script.hHooks', 'script.hStructure', 'script.hCta', 'script.hPersuasion', 'script.statsHeading', 'theory.hMapped']],
  ['action', ['kb.hActions', 'script.hTodo']],
  ['caution', ['theory.hDiff', 'theory.hMissing']],
  ['source', ['src.heading']],
]

const LANGS: Lang[] = ['zh-TW', 'en']
const byHeading = new Map(TONES.flatMap(([tone, keys]) => keys.flatMap((k) => LANGS.map((l) => [t(k, {}, l), tone] as const))))

export const toneOf = (heading: string): Tone => byHeading.get(heading.replace(/[*_]/g, '').trim()) ?? 'method'

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] }

const textOf = (n: HastNode): string => n.value ?? (n.children ?? []).map(textOf).join('')

/** 每個 ## 連同它底下的內容包成一個區塊，區塊的顏色由標題決定 */
export const rehypeSections = () => (tree: HastNode) => {
  const out: HastNode[] = []
  let section: HastNode | null = null
  for (const node of tree.children ?? []) {
    if (node.tagName === 'h2') {
      const dataTone = toneOf(textOf(node))
      node.properties = { ...node.properties, dataTone }
      section = { type: 'element', tagName: 'section', properties: { className: ['md-section'], dataTone }, children: [node] }
      out.push(section)
    } else if (section) section.children!.push(node)
    else out.push(node)
  }
  // 區塊已經是卡片，AI 放在章節結尾的分隔線只會多出一條線
  for (const s of out) {
    if (s.tagName !== 'section') continue
    const isTail = (n?: HastNode) => n?.tagName === 'hr' || (n?.type === 'text' && !n.value?.trim())
    while (isTail(s.children!.at(-1))) s.children!.pop()
  }
  tree.children = out
}
