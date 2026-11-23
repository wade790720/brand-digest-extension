import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { expect, it } from 'vitest'
import { rehypeTables, repairBold } from './md-fix'

const html = (md: string) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, repairBold(md)))
const strong = (md: string) => html(md).match(/<strong>(.*?)<\/strong>/)?.[1]?.replace(/​/g, '')

it('粗體緊貼中文標點也會轉換', () => {
  expect(strong('**用「痛點 + 反常識」**四大 Hook')).toBe('用「痛點 + 反常識」')
  expect(strong('這是**「重點」**後面')).toBe('「重點」')
  expect(strong('**A：**說明')).toBe('A：')
  expect(strong('**結論（重要）**接著')).toBe('結論（重要）')
  expect(strong('前面**「引號」開頭**後面')).toBe('「引號」開頭')
})

it('AI 忘了收尾的 ** 不會顯示出來', () => {
  const out = html('**用「痛點」四大 Hook，配合故事。')
  expect(out).not.toContain('**')
  expect(out).toContain('用「痛點」四大 Hook')
})

it('每一點各算各的：一點沒收尾，不會把下一點吃成粗體', () => {
  const out = html('- **第一點沒收尾\n- **第二點**正常')
  expect(out).not.toContain('**')
  expect(out).toContain('<strong>第二點</strong>')
})

it('星號內側多了空白也能轉換', () => {
  expect(strong('這是 ** 重點 ** 後面')).toBe('重點')
})

it('程式碼裡的星號不動，行數不變（勾選項目靠行號對應）', () => {
  expect(repairBold('用 `**x` 表示')).toBe('用 `**x` 表示')
  expect(repairBold('```\n**沒收尾\n```')).toBe('```\n**沒收尾\n```')
  const md = '## 標題\n\n- [ ] **沒收尾\n- [ ] 正常'
  expect(repairBold(md).split('\n')).toHaveLength(md.split('\n').length)
})

const cell = (tagName: string, text: string) => ({ type: 'element', tagName, properties: {}, children: [{ type: 'text', value: text }] })
const row = (tag: string, ...texts: string[]) => ({ type: 'element', tagName: 'tr', children: texts.map((x) => cell(tag, x)) })
const table = (head: string[], ...body: string[][]) => ({ type: 'root', children: [{ type: 'element', tagName: 'table', children: [
  { type: 'element', tagName: 'thead', children: [row('th', ...head)] },
  { type: 'element', tagName: 'tbody', children: body.map((b) => row('td', ...b)) },
] }] })
type Cell = { properties: Record<string, unknown>; children: { value: string }[] }
const rows = (t: ReturnType<typeof table>) => (t.children[0].children as unknown as { children: { children: Cell[] }[] }[]).flatMap((s) => s.children).map((r) => r.children)

it('表格：整欄沒資料就拿掉，數字欄靠右，排序依據的那欄帶比例', () => {
  const t = table(['Hook 類型', '則數', '平均播放', '平均按讚'], ['提問', '19', '—', '953'], ['結果先行', '6', '—', '513'], ['爭議觀點', '1', '—', '184'])
  rehypeTables()(t)
  const [head, first, , last] = rows(t)
  expect(head.map((c) => c.children[0].value)).toEqual(['Hook 類型', '則數', '平均按讚'])
  expect(head[0].properties.dataNum).toBeUndefined()
  expect(head[1].properties.dataNum).toBe(true)
  expect(first[2].properties.dataBar).toBe(100)
  expect(last[2].properties.dataBar).toBe(19)
  expect(first[1].properties.dataBar).toBeUndefined()
})

it('表格：文字欄不當數字，沒排序的數字欄不畫比例', () => {
  const t = table(['觀念', '做法'], ['快', '刪掉口頭禪'], ['慢', '放慢語速'])
  rehypeTables()(t)
  expect(rows(t)[1][1].properties.dataNum).toBeUndefined()
  const u = table(['類型', '則數'], ['甲', '1'], ['乙', '9'], ['丙', '3'])
  rehypeTables()(u)
  expect(rows(u)[1][1].properties.dataNum).toBe(true)
  expect(rows(u)[1][1].properties.dataBar).toBeUndefined()
})
