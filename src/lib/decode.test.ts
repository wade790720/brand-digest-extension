import { expect, it } from 'vitest'
import type { Post } from '@/types'
import { decodeState, windowStart } from './decode'
import { toDigest } from './pipeline'

const post = (code: string, extra: Partial<Post> = {}) => ({ code, status: 'new', ...extra }) as Post
const done = (code: string, at: number, hookType?: string) =>
  post(code, { status: 'done', processedAt: at, digest: { topic: code, points: ['a', 'b'], quotes: [], terms: [], value: '中', hookType } })

it('拆解畫面：current 前面算處理過，只數成功的；用完成時間估剩餘時間', () => {
  const posts = [done('a', 1000, '提問'), post('b', { status: 'error' }), done('c', 4000, '提問'), post('d'), post('e')]
  const s = decodeState(posts, 'd', -1000)
  expect(s.processed).toBe(3)
  expect(s.decoded).toBe(2)
  expect(s.points).toBe(4)
  expect(s.hooks).toEqual([['提問', 2]])
  expect(s.latest?.code).toBe('c')
  expect(Math.round(s.etaMs!)).toBe(3333)
  expect(decodeState(posts, 'a', 0).etaMs).toBeUndefined()
  expect(decodeState(posts, undefined, 0).processed).toBe(5)
})

it('萃取結果的開場類型：被翻譯算其他，沒給就不帶', () => {
  expect(toDigest({ hookType: '痛點' }).hookType).toBe('痛點')
  expect(toDigest({ hookType: 'Question' }).hookType).toBe('其他')
  expect('hookType' in toDigest({})).toBe(false)
})

it('縮圖牆只顯示一段：一次捲一列，正在處理的在第二列，最後停在結尾', () => {
  expect(windowStart(0, 100)).toBe(0)
  expect(windowStart(15, 100)).toBe(0)
  expect(windowStart(16, 100)).toBe(8)
  expect(windowStart(99, 100)).toBe(76)
  expect(windowStart(5, 10)).toBe(0)
})

it('目前處理過的都失敗時，也能用失敗的處理時間估剩餘時間', () => {
  const failed = (code: string, at: number) => post(code, { status: 'error', processedAt: at })
  const s = decodeState([failed('a', 1000), failed('b', 2000), post('c'), post('d')], 'c', 0)
  expect(s.decoded).toBe(0)
  expect(s.etaMs).toBe(2000) // 2 則花了 2000，剩 2 則
})
