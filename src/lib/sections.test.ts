import { expect, it } from 'vitest'
import { rehypeSections, toneOf } from './sections'

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
  expect(tree.children[1]).toMatchObject({ properties: { dataTone: 'action' }, children: [{ tagName: 'h2' }, { tagName: 'ul' }] })
})
