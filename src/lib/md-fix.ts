const STARS = /`[^`\n]*`|(?<![\\*])\*\*(?!\*)/g
const BLOCK_START = /^\s*(?:[-*+]\s|\d+\.\s|#{1,6}\s|>|\|)/
const FENCE = /^\s*(?:```|~~~)/
const ZWSP = '​'
const isPunct = (c: string) => /[\p{P}\p{S}]/u.test(c)
const isEdge = (c: string | undefined) => !c || /\s/.test(c) || isPunct(c)

/** 一段裡的 ** 兩兩配對：落單的拿掉，內側空白去掉。
 *  CommonMark 規定 ** 緊貼標點時，外側要是空白或標點，中文不留空白就不算粗體，所以在中間補一個零寬字元 */
function repairBlock(text: string) {
  const marks = [...text.matchAll(STARS)].filter((m) => m[0] === '**').map((m) => m.index)
  const lone = marks.length % 2 ? marks.pop()! : -1
  let out = ''
  let at = 0
  for (let i = 0; i < marks.length; i += 2) {
    const [open, close] = [marks[i], marks[i + 1]]
    const inner = text.slice(open + 2, close).trim()
    if (!inner) continue
    const head = isPunct(inner[0]) && !isEdge(text[open - 1]) ? ZWSP : ''
    const tail = isPunct(inner.at(-1)!) && !isEdge(text[close + 2]) ? ZWSP : ''
    out += text.slice(at, open) + `**${head}${inner}${tail}**`
    at = close + 2
  }
  return out + (lone < 0 ? text.slice(at) : text.slice(at, lone) + text.slice(lone + 2))
}

/** 修正 AI 常寫壞的粗體，只影響畫面，下載的 Markdown 還是原文。不增減行數：勾選項目靠行號對應 */
export function repairBold(md: string) {
  const out: string[] = []
  let block: string[] = []
  let fenced = false
  const flush = () => {
    if (block.length) out.push(repairBlock(block.join('\n')))
    block = []
  }
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) {
      flush()
      fenced = !fenced
      out.push(line)
    } else if (fenced) out.push(line)
    else if (!line.trim()) {
      flush()
      out.push(line)
    } else {
      if (BLOCK_START.test(line)) flush()
      block.push(line)
    }
  }
  flush()
  return out.join('\n')
}

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] }

const textOf = (n: HastNode): string => n.value ?? (n.children ?? []).map(textOf).join('')
const elements = (n: HastNode, tag: string) => (n.children ?? []).filter((c) => c.tagName === tag)
const BLANK = /^(?:|—|–|-|n\/a)$/i
const NUMBER = /^[\d,]+(?:\.\d+)?\s?[%萬億kKmM]?$/
const valueOf = (s: string) => {
  const n = parseFloat(s.replace(/,/g, ''))
  return /萬/.test(s) ? n * 1e4 : /億/.test(s) ? n * 1e8 : /[kK]/.test(s) ? n * 1e3 : /[mM]/.test(s) ? n * 1e6 : n
}

function markTable(table: HastNode) {
  const head = elements(table, 'thead').flatMap((s) => elements(s, 'tr'))
  const body = elements(table, 'tbody').flatMap((s) => elements(s, 'tr'))
  if (!body.length) return
  const cols = Math.max(...body.map((r) => elements(r, 'td').length))
  const column = (i: number) => body.map((r) => textOf(elements(r, 'td')[i] ?? { type: 'text', value: '' }).trim())

  const empty = new Set<number>()
  for (let i = 0; i < cols; i++) if (column(i).every((v) => BLANK.test(v))) empty.add(i)
  if (empty.size === cols) return

  const numeric = new Set<number>()
  let ranked = -1
  for (let i = 0; i < cols; i++) {
    if (empty.has(i)) continue
    const values = column(i).filter((v) => !BLANK.test(v))
    if (!values.every((v) => NUMBER.test(v))) continue
    numeric.add(i)
    const nums = values.map(valueOf)
    if (nums.length >= 3 && nums[0] > nums.at(-1)! && nums.every((n, k) => !k || n <= nums[k - 1])) ranked = i
  }

  const most = ranked < 0 ? 0 : Math.max(...column(ranked).filter((v) => !BLANK.test(v)).map(valueOf))
  for (const row of [...head, ...body]) {
    const cells = (row.children ?? []).filter((c) => c.tagName === 'td' || c.tagName === 'th')
    cells.forEach((c, i) => {
      if (numeric.has(i)) c.properties = { ...c.properties, dataNum: true }
      if (i === ranked && c.tagName === 'td' && !BLANK.test(textOf(c).trim()))
        c.properties = { ...c.properties, dataBar: Math.round((valueOf(textOf(c).trim()) / most) * 100) }
    })
    row.children = cells.filter((_, i) => !empty.has(i))
  }
}

/** 表格：整欄沒資料就拿掉，標出數字欄，由大到小排序的那欄附上比例 */
export const rehypeTables = () => (tree: HastNode) => {
  const walk = (n: HastNode) => {
    if (n.tagName === 'table') markTable(n)
    else n.children?.forEach(walk)
  }
  walk(tree)
}
