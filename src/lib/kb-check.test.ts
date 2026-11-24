import { expect, it } from 'vitest'
import { badness, fixNotes, needsFix, reviewKb } from './kb-check'

const good = `## 這個創作者在教什麼

- 先刪工作再自動化 [1]

## 核心方法論

1. **先刪再快**：一個步驟先問能不能刪 [2]

## 主題聚類

### 時間

- 早上做要事 [3]

## 可行動清單

- [ ] 刪掉一個例行步驟 [1]
`

it('完整的知識庫沒有問題', () => {
  const r = reviewKb(good, 3, 'zh-TW')
  expect(r).toEqual({ missing: [], badCites: [], noTasks: false, uncited: [] })
  expect(needsFix(r, 3)).toBe(false)
})

it('抓出缺的章節、不存在的編號、沒有勾選框；n12 這種寫法也算編號', () => {
  const md = good.replace('## 主題聚類', '## 其他').replace('- [ ] 刪掉', '- 刪掉').replace('[3]', 'n9')
  const r = reviewKb(md, 3, 'zh-TW')
  expect(r.missing).toEqual(['主題聚類'])
  expect(r.badCites).toEqual([9])
  expect(r.noTasks).toBe(true)
  expect(r.uncited).toEqual([3])
  expect(needsFix(r, 3)).toBe(true)
  expect(fixNotes(r, 3, 'zh-TW', false).join('\n')).toMatch(/主題聚類[\s\S]*\[9\][\s\S]*勾選框/)
})

it('少數貼文沒引用不用修；超過三成才請 AI 補進去', () => {
  expect(needsFix(reviewKb(good, 4, 'zh-TW'), 4)).toBe(false)
  const r = reviewKb(good, 20, 'zh-TW')
  expect(needsFix(r, 20)).toBe(true)
  expect(fixNotes(r, 20, 'zh-TW', true)).toHaveLength(1)
  expect(fixNotes(r, 20, 'zh-TW', false)).toHaveLength(0)
})

it('英文標題也認得；章節缺漏比沒引用嚴重', () => {
  const en = good.replace('這個創作者在教什麼', 'What this creator teaches').replace('核心方法論', 'Core methods')
    .replace('主題聚類', 'Topic groups').replace('可行動清單', 'Action list')
  expect(reviewKb(en, 3, 'en').missing).toEqual([])
  expect(badness({ missing: ['x'], badCites: [], noTasks: false, uncited: [] }))
    .toBeGreaterThan(badness({ missing: [], badCites: [], noTasks: false, uncited: Array(50).fill(1) }))
})
