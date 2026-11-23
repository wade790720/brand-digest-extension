import { expect, it } from 'vitest'
import type { CollectMessage } from '@/types'
import { createCollector } from './collector'

const pic = 'https://scontent.cdninstagram.com/me.jpg'
// 結構照 2026-11 實際觀察到的主播主頁：頭像在主播資料裡，貼文的 user 只有 username 和 id
const profile = JSON.stringify({ require: [['ScheduledServerJS', 'handle', null, [{ __bbox: { result: { data: {
  xig_user_by_username: { id: '1', username: 'coach', full_name: '教練', profile_pic_url: pic },
} } } }]]] })
const posts = JSON.stringify({ data: { items: [{ code: 'AAA', media_type: 2, user: { id: '1', username: 'coach' } }] } })

function run(...texts: string[]) {
  const sent: CollectMessage[] = []
  const collect = createCollector((m) => sent.push(m))
  for (const t of texts) collect(t, 'coach')
  return sent
}

it('主播資料先到：貼文訊息帶著頭像', () => {
  const sent = run(profile, posts)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ avatarUrl: pic, posts: [{ code: 'AAA' }] })
})

it('貼文先到：主播資料到了再補送一則只有頭像的訊息，而且只補一次', () => {
  const sent = run(posts, profile, profile)
  expect(sent).toHaveLength(2)
  expect(sent[0]).not.toHaveProperty('avatarUrl')
  expect(sent[1]).toMatchObject({ creator: 'coach', avatarUrl: pic, posts: [] })
})

it('只有主播資料、沒有貼文：不送訊息，不會跳出收集提示', () => {
  expect(run(profile)).toEqual([])
})

it('串流格式（一行一段）也讀得到', () => {
  expect(run(`${profile}\n${posts}`)[0]).toMatchObject({ avatarUrl: pic })
})

it('別人的頭像不算，不是 IG 圖片伺服器的網址也不算', () => {
  const other = JSON.stringify({ viewer: { username: 'me', profile_pic_url: 'https://scontent.cdninstagram.com/viewer.jpg' } })
  const fake = JSON.stringify({ user: { username: 'coach', profile_pic_url: 'https://evil.example/a.jpg' } })
  expect(run(other, fake, posts)[0]).not.toHaveProperty('avatarUrl')
})
