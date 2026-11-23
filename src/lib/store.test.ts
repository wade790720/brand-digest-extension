import { beforeEach, expect, it } from 'vitest'
import { mem } from './test-storage'
import { getCreators, importAll, mergeCollected } from './store'

beforeEach(() => mem.clear())

it('收集合併：已萃取的結果保留、網址更新；清單依發文時間新的在前（含這批沒有的舊貼文）', async () => {
  mem.set('post:OLD', { code: 'OLD', creator: 'coach', takenAt: 50, caption: '', collectedAt: 0, status: 'new' })
  mem.set('post:A', { code: 'A', creator: 'coach', takenAt: 100, caption: '', collectedAt: 0, status: 'done', digest: { topic: 't' }, audioUrl: 'old' })
  mem.set('creator:coach', { name: 'coach', fullName: '', codes: ['A', 'OLD'] })
  await mergeCollected('coach', '教練', [
    { code: 'NEW', creator: 'coach', takenAt: 200, caption: '' },
    { code: 'A', creator: 'coach', takenAt: 100, caption: '', audioUrl: 'fresh' },
  ])
  expect(mem.json('creator:coach').codes).toEqual(['NEW', 'A', 'OLD'])
  expect(mem.json('post:A')).toMatchObject({ status: 'done', digest: { topic: 't' }, audioUrl: 'fresh' })
  expect(mem.json('post:NEW').status).toBe('new')
  expect((await getCreators()).map((c) => c.name)).toEqual(['coach'])
})

it('匯入備份：本機較新的知識庫和手冊不會被舊備份蓋掉；已完成的貼文保留；貼文清單取聯集', async () => {
  mem.set('kb:coach', { markdown: '新', updatedAt: 200, postCount: 2 })
  mem.set('playbook:coach', { markdown: '新', updatedAt: 200, postCount: 2 })
  mem.set('post:A', { code: 'A', status: 'done' })
  mem.set('creator:coach', { name: 'coach', fullName: '', codes: ['A'] })
  const n = await importAll({ app: 'brand-digest', data: {
    'kb:coach': { markdown: '舊', updatedAt: 100, postCount: 1 },
    'playbook:coach': { markdown: '更新', updatedAt: 300, postCount: 3 },
    'post:A': { code: 'A', status: 'new' },
    'creator:coach': { name: 'coach', fullName: '', codes: ['B'] },
  } })
  expect(n).toBe(1)
  expect(mem.json('kb:coach').markdown).toBe('新')
  expect(mem.json('playbook:coach').markdown).toBe('更新')
  expect(mem.json('post:A').status).toBe('done')
  expect(mem.json('creator:coach').codes.sort()).toEqual(['A', 'B'])
})

it('同時收到兩批收集：誰呼叫都依序合併，兩批的貼文都留在清單裡', async () => {
  await Promise.all([
    mergeCollected('coach', '', [{ code: 'P1', creator: 'coach', takenAt: 1, caption: '' }]),
    mergeCollected('coach', '', [{ code: 'P2', creator: 'coach', takenAt: 2, caption: '' }]),
  ])
  expect(mem.json('creator:coach').codes.sort()).toEqual(['P1', 'P2'])
})
