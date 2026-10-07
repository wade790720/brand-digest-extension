import { expect, it } from 'vitest'
import { ConsentGate } from './consent'

it('第一批要問，回答前的資料先暫存，按收集一起送出', () => {
  const g = new ConsentGate<string>()
  expect(g.receive('coach', 'a')).toBe('ask')
  expect(g.receive('coach', 'b')).toBe('wait')
  expect(g.accept()).toEqual(['a', 'b'])
  expect(g.receive('coach', 'c')).toBe('forward')
})

it('按取消，這次瀏覽都不收集，也不再問', () => {
  const g = new ConsentGate<string>()
  g.receive('coach', 'a')
  g.decline()
  expect(g.receive('coach', 'b')).toBe('drop')
  expect(g.buffer).toEqual([])
})

it('點開貼文不算離開；離開主頁再回來重新問', () => {
  const g = new ConsentGate<string>()
  g.receive('coach', 'a')
  g.decline()
  expect(g.navigate('/p/ABC/')).toBe(false)
  expect(g.navigate('/coach/')).toBe(false)
  expect(g.receive('coach', 'b')).toBe('drop')
  expect(g.navigate('/explore/')).toBe(true)
  expect(g.receive('coach', 'c')).toBe('ask')
})

it('換到別的博主，重新問', () => {
  const g = new ConsentGate<string>()
  g.receive('coach', 'a')
  g.accept()
  expect(g.receive('other', 'b')).toBe('ask')
})
