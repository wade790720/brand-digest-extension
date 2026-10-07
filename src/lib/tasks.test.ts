import { expect, it } from 'vitest'
import { taskKey, taskKeys } from './tasks'

it('勾選項目取出原文，其他行回傳 null', () => {
  expect(taskKey('- [ ] 每天記錄一次交易 [3]')).toBe('每天記錄一次交易 [3]')
  expect(taskKey('  * [x] **先**分批進場')).toBe('**先**分批進場')
  expect(taskKey('- 一般項目')).toBeNull()
  expect(taskKey(undefined)).toBeNull()
})

it('整份文件的項目依順序、不重複', () => {
  expect(taskKeys('## 可行動清單\n\n- [ ] A\n- [ ] B\n- [ ] A\n\n- C')).toEqual(['A', 'B'])
})
