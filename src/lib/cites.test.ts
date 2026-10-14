import { expect, it } from 'vitest'
import { linkCites, normalizeCites } from './cites'

it('各種出處寫法統一成 [n]', () => {
  expect(normalizeCites('範例：`Hook → CTA`【n10】')).toBe('範例：`Hook → CTA`[10]')
  expect(normalizeCites('| PAS | 說明 | n1、n6 |')).toBe('| PAS | 說明 | [1]、[6] |')
  expect(normalizeCites('見【 3 】和 [n7]')).toBe('見[3]和 [7]')
  expect(normalizeCites('早上做要事 [3][7]')).toBe('早上做要事 [3][7]')
})

it('英文字裡的 n 加數字不動', () => {
  expect(normalizeCites('用 n8n 串接，m2n4 也不動')).toBe('用 n8n 串接，m2n4 也不動')
  const url = '[看原文](https://www.instagram.com/p/DAx_n52/)'
  expect(normalizeCites(url)).toBe(url)
})

it('變成站內連結；一般連結不動', () => {
  expect(linkCites('做法 n2')).toBe('做法 [\\[2\\]](#src-2)')
  expect(linkCites('[看原文](https://x)')).toBe('[看原文](https://x)')
})
