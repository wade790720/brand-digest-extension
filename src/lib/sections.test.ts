import { expect, it } from 'vitest'
import { rehypePointTones, rehypeSections, toneOf } from './sections'

it('標題決定區塊顏色，中英文都認得，認不得的算做法', () => {
  expect(toneOf('這個創作者在教什麼')).toBe('key')
  expect(toneOf('Action list')).toBe('action')
  expect(toneOf('**和理論不一樣的地方**')).toBe('caution')
  expect(toneOf('來源索引')).toBe('source')
  expect(toneOf('AI 自己多寫的標題')).toBe('method')
})

it('每個 ## 連同內容包成一區，第一個標題前的內容留在外面', () => {
  const el = (tagName: string, text: string) => ({ type: 'element', tagName, children: [{ type: 'text', value: text }] })
  const tree = { type: 'root', children: [el('p', '共 3 則'), el('h2', '可行動清單'), el('ul', 'A'), el('h2', '來源索引'), el('ol', 'B')] }
  rehypeSections()(tree)
  expect(tree.children.map((n) => n.tagName)).toEqual(['p', 'section', 'section'])
  const newline = { type: 'text', value: '\n' }
  const withRule = { type: 'root', children: [el('h2', '一句話總結'), el('p', 'A'), newline, { type: 'element', tagName: 'hr', children: [] }, { ...newline }] }
  rehypeSections()(withRule)
  expect((withRule.children[0] as { children: { tagName?: string }[] }).children.map((n) => n.tagName)).toEqual(['h2', 'p'])
  expect(tree.children[1]).toMatchObject({ properties: { dataTone: 'action' }, children: [{ tagName: 'h2' }, { tagName: 'ul' }] })
})

it('要點開頭的標籤換成小標、整點上色；中英文都認得；認不得的字和子項目不動', () => {
  const text = (value: string) => ({ type: 'text', value })
  const li = (...children: object[]) => ({ type: 'element', tagName: 'li', children })
  const strong = { type: 'element', tagName: 'strong', children: [text('先刪再快')] }
  const tree = { type: 'root', children: [{ type: 'element', tagName: 'ul', children: [
    li(text('做法｜'), strong, text('：先問能不能刪 [2]')),
    li({ type: 'element', tagName: 'p', children: [text('Watch | 太早自動化')] }),
    li(text('備註｜不是標籤')),
  ] }] }
  rehypePointTones()(tree as never)
  const [a, b, c] = tree.children[0].children as { properties?: { dataTone?: string }; children: { tagName?: string; value?: string; children?: { value?: string; tagName?: string }[] }[] }[]
  expect(a.properties?.dataTone).toBe('method')
  expect(a.children[0]).toMatchObject({ tagName: 'span', children: [{ value: '做法' }] })
  expect(a.children[1].value).toBe('')
  expect(b.properties?.dataTone).toBe('caution')
  expect(b.children[0].children?.[0]).toMatchObject({ tagName: 'span' })
  expect(b.children[0].children?.[1]).toMatchObject({ value: '太早自動化' })
  expect(c.properties?.dataTone).toBeUndefined()
})

it('勾選項目開頭的標籤不轉成小標，免得小標跑到勾選框前面', () => {
  const tree = { type: 'root', children: [{ type: 'element', tagName: 'li', children: [
    { type: 'element', tagName: 'input', properties: { type: 'checkbox' }, children: [] }, { type: 'text', value: ' 照做｜刪一步' },
  ] }] }
  rehypePointTones()(tree as never)
  expect((tree.children[0] as { properties?: object }).properties).toBeUndefined()
})
