import { expect, it } from 'vitest'
import { dropTeachLine, taskKey, taskKeys, teachLine } from './tasks'

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

it('知識庫畫面拿掉第一段；章節變空就連標題拿掉', () => {
  expect(dropTeachLine('_n_\n\n## 教什麼\n\n第一段 [1]\n還是第一段\n\n第二段\n\n## 方法\n- A')).toBe('_n_\n\n## 教什麼\n\n第二段\n\n## 方法\n- A')
  expect(dropTeachLine('_n_\n\n## 教什麼\n\n只有一段\n\n## 方法\n- A')).toBe('_n_\n\n## 方法\n- A')
  expect(dropTeachLine('沒有章節')).toBe('沒有章節')
})

it('第一節是清單時只拿掉儀表板顯示的那一點，其他點和標題留著', () => {
  const md = '_n_\n\n## 教什麼\n\n- 第一點 [1]\n- 第二點\n- 第三點\n\n## 方法\n- A'
  expect(teachLine(md)).toBe('第一點')
  expect(dropTeachLine(md)).toBe('_n_\n\n## 教什麼\n\n- 第二點\n- 第三點\n\n## 方法\n- A')
  expect(teachLine('## 教什麼\n\n1. 編號的第一點')).toBe('編號的第一點')
})

it('第一點底下的子項目和續行跟著第一點一起拿掉，不會變成沒有上層的孤兒', () => {
  const nested = '## 教什麼\n\n- 第一點\n  - 子項目一\n  - 子項目二\n- 第二點\n\n## 方法'
  expect(dropTeachLine(nested)).toBe('## 教什麼\n\n- 第二點\n\n## 方法')
  const lazy = '## 教什麼\n\n- 第一點很長\n接著寫的續行\n- 第二點\n\n## 方法'
  expect(dropTeachLine(lazy)).toBe('## 教什麼\n\n- 第二點\n\n## 方法')
})

it('第一節是表格：儀表板不顯示那一句，知識庫照原樣', () => {
  const table = '## 教什麼\n\n| 主題 | 說明 |\n|---|---|\n| 時間 | 早上做要事 |\n\n## 方法'
  expect(teachLine(table)).toBe('')
  expect(dropTeachLine(table)).toBe(table)
})
