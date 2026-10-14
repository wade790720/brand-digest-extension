import { expect, it } from 'vitest'
import { DICT, resolveLang, t } from './i18n'

it('兩種語言的 key 完全一致', () => {
  expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT['zh-TW']).sort())
})

it('兩種語言的 {變數} 一致', () => {
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
  for (const k of Object.keys(DICT['zh-TW']) as (keyof typeof DICT.en)[]) expect(vars(DICT.en[k]), k).toEqual(vars(DICT['zh-TW'][k]))
})

it('預設語言：zh 開頭用中文，其他用英文；手動設定優先', () => {
  expect(resolveLang('auto', 'zh-TW')).toBe('zh-TW')
  expect(resolveLang('auto', 'zh-CN')).toBe('zh-TW')
  expect(resolveLang('auto', 'en-US')).toBe('en')
  expect(resolveLang('auto', 'ja')).toBe('en')
  expect(resolveLang(undefined, 'zh-TW')).toBe('zh-TW')
  expect(resolveLang('en', 'zh-TW')).toBe('en')
  expect(resolveLang('zh-TW', 'en-US')).toBe('zh-TW')
})

it('t 代入變數', () => {
  expect(t('cv.collected', { n: 3 }, 'en')).toBe('3 collected')
  expect(t('cv.collected', { n: 3 }, 'zh-TW')).toBe('已收集 3 則')
})
