import { expect, it } from 'vitest'
import { taskKey, taskKeys, teachLine } from './tasks'

it('勾選項目取出原文，其他行回傳 null', () => {
  expect(taskKey('- [ ] 每天記錄一次交易 [3]')).toBe('每天記錄一次交易 [3]')
  expect(taskKey('  * [x] **先**分批進場')).toBe('**先**分批進場')
  expect(taskKey('- 一般項目')).toBeNull()
  expect(taskKey(undefined)).toBeNull()
})

it('整份文件的項目依順序、不重複', () => {
  expect(taskKeys('## 可行動清單\n\n- [ ] A\n- [ ] B\n- [ ] A\n\n- C')).toEqual(['A', 'B'])
})

it('儀表板的一句話：第一個章節的第一段，去掉出處和粗體', () => {
  expect(teachLine('_共 3 則_\n\n## 這個創作者在教什麼\n\n- 教小老闆**把時間**做對 [1][2]\n\n## 方法')).toBe('教小老闆把時間做對')
  expect(teachLine('沒有章節')).toBe('')
})
