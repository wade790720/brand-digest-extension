import { stripTag } from '@/lib/sections'

const TASK = /^\s*[-*+] \[[ xX]\] (.+)$/

export function taskKey(line: string | undefined): string | null {
  const m = line?.match(TASK)
  return m ? stripTag(m[1]).trim() : null
}

export const taskKeys = (md: string) => [...new Set(md.split('\n').map(taskKey).filter((k): k is string => !!k))]

export function teachLine(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## '))
  if (start < 0) return ''
  const first = lines.slice(start + 1).find((l) => l.trim() && !l.startsWith('#'))
  if (first?.trimStart().startsWith('|')) return '' // 表格的一列不是一句話
  return stripTag((first ?? '').replace(LIST_ITEM, '')).replace(/\[\d+\]/g, '').replace(/\*\*/g, '').trim()
}

const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/

export function dropTeachLine(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## '))
  const from = lines.findIndex((l, i) => i > start && l.trim() !== '')
  if (start < 0 || from < 0 || lines[from].startsWith('#') || lines[from].trimStart().startsWith('|')) return md
  // 清單只拿掉儀表板顯示的第一點，連同它的子項目和續行；一般段落整段拿掉
  let to = from + 1
  if (LIST_ITEM.test(lines[from])) {
    const indent = lines[from].search(/\S/)
    const belongs = (l: string) => l.search(/\S/) > indent || (!LIST_ITEM.test(l) && !l.startsWith('#'))
    while (to < lines.length && lines[to].trim() !== '' && belongs(lines[to])) to++
  } else {
    while (to < lines.length && lines[to].trim() !== '' && !lines[to].startsWith('#')) to++
  }
  const next = lines.findIndex((l, i) => i >= to && l.trim() !== '')
  if (next < 0 || lines[next].startsWith('#'))
    return [...lines.slice(0, start), ...lines.slice(next < 0 ? lines.length : next)].join('\n')
  return [...lines.slice(0, from), ...lines.slice(next)].join('\n')
}
