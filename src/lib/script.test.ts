import { expect, it } from 'vitest'
import type { Post } from '@/types'
import { hookStats, statsTable, toBreakdown } from './script'

it('拆解結果：沒有 hook 當失敗；分類不在清單內歸為最後一類', () => {
  expect(toBreakdown({ hookType: '提問' })).toBeNull()
  const b = toBreakdown({ hook: ' 你知道嗎？ ', hookType: '亂寫', beats: [{ role: 'Hook', text: 'x' }, { text: '沒有 role' }], ctaType: '留言關鍵字' })!
  expect(b.hook).toBe('你知道嗎？')
  expect(b.hookType).toBe('其他')
  expect(b.beats).toEqual([{ role: 'Hook', text: 'x' }])
  expect(b.ctaType).toBe('留言關鍵字')
  expect(b.techniques).toEqual([])
})

const post = (hookType: string, plays?: number, likes?: number) => ({
  script: { hookType }, ...(plays !== undefined || likes !== undefined ? { stats: { plays, likes } } : {}),
}) as unknown as Post

it('依 hook 類型算平均，播放高的排前面；沒數字的貼文不拉低平均', () => {
  const rows = hookStats([post('提問', 1000, 10), post('提問', 3000, 30), post('痛點', 5000), post('痛點'), post('其他')])
  expect(rows).toEqual([
    { type: '痛點', count: 2, plays: 5000, likes: undefined },
    { type: '提問', count: 2, plays: 2000, likes: 20 },
    { type: '其他', count: 1, plays: undefined, likes: undefined },
  ])
  expect(statsTable(rows)).toContain('| 痛點 | 2 | 5,000 | — |')
})

it('完全沒有互動數字就不出數據表', () => {
  expect(statsTable(hookStats([post('提問'), post('痛點')]))).toBe('')
})
