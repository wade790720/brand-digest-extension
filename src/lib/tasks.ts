const TASK = /^\s*[-*+] \[[ xX]\] (.+)$/

export function taskKey(line: string | undefined): string | null {
  return line?.match(TASK)?.[1].trim() ?? null
}

export const taskKeys = (md: string) => [...new Set(md.split('\n').map(taskKey).filter((k): k is string => !!k))]

export function teachLine(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## '))
  if (start < 0) return ''
  const first = lines.slice(start + 1).find((l) => l.trim() && !l.startsWith('#'))
  return (first ?? '').replace(LIST_ITEM, '').replace(/\[\d+\]/g, '').replace(/\*\*/g, '').trim()
}

const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/

export function dropTeachLine(md: string): string {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.startsWith('## '))
  const from = lines.findIndex((l, i) => i > start && l.trim() !== '')
  if (start < 0 || from < 0 || lines[from].startsWith('#') || lines[from].trimStart().startsWith('|')) return md
  // 清單只拿掉儀表板顯示的第一點；一般段落整段拿掉
  let to = from + 1
  if (!LIST_ITEM.test(lines[from]))
    while (to < lines.length && lines[to].trim() !== '' && !lines[to].startsWith('#')) to++
  const next = lines.findIndex((l, i) => i >= to && l.trim() !== '')
  if (next < 0 || lines[next].startsWith('#'))
    return [...lines.slice(0, start), ...lines.slice(next < 0 ? lines.length : next)].join('\n')
  return [...lines.slice(0, from), ...lines.slice(next)].join('\n')
}
