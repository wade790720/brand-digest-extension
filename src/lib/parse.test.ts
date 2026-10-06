import { describe, expect, it } from 'vitest'
import { audioUrlOf, extractPosts, profileOf } from './parse'

// 結構照 2026-10 實際觀察到的博主主頁 graphql 回應（網址為假）
const manifest =
  '<MPD><Period><AdaptationSet contentType="video"><Representation codecs="vp09"><BaseURL>https://cdn/v.mp4?a=1&amp;b=2</BaseURL></Representation></AdaptationSet>' +
  '<AdaptationSet contentType="audio"><Representation codecs="mp4a"><BaseURL>https://cdn/a.mp4?x=1&amp;y=2</BaseURL></Representation></AdaptationSet></Period></MPD>'
const response = {
  data: {
    xdt_api__v1__feed__user_timeline_graphql_connection: {
      edges: [
        { node: { code: 'AAA', media_type: 2, taken_at: 100, caption: { text: '開場三秒' }, user: { username: 'Coach', full_name: '教練' },
            video_versions: [{ url: 'https://cdn/full.mp4' }], video_dash_manifest: manifest } },
        { node: { code: 'BBB', media_type: 1, taken_at: 90, caption: null, user: { username: 'coach' } } },
        { node: { code: 'CCC', media_type: 2, user: { username: 'someone_else' } } },
      ],
    },
  },
}

describe('profileOf', () => {
  it('只認博主主頁', () => {
    expect(profileOf('/Coach/')).toBe('coach')
    expect(profileOf('/coach')).toBe('coach')
    expect(profileOf('/coach/reels/')).toBeNull()
    expect(profileOf('/explore/')).toBeNull()
    expect(profileOf('/p/AAA/')).toBeNull()
  })
})

describe('audioUrlOf', () => {
  it('取音軌、還原 &amp;', () => expect(audioUrlOf(manifest)).toBe('https://cdn/a.mp4?x=1&y=2'))
  it('沒有 manifest', () => expect(audioUrlOf(undefined)).toBeUndefined())
})

describe('extractPosts', () => {
  it('只收這位博主的貼文，帶出文案、時間、音軌', () => {
    const msg = extractPosts(response, 'coach')!
    expect(msg.fullName).toBe('教練')
    expect(msg.posts.map((p) => p.code)).toEqual(['AAA', 'BBB'])
    expect(msg.posts[0]).toMatchObject({ caption: '開場三秒', takenAt: 100, audioUrl: 'https://cdn/a.mp4?x=1&y=2' })
    expect(msg.posts[1]).toMatchObject({ caption: '', audioUrl: undefined })
  })
  it('沒有這位博主的貼文就回 null', () => expect(extractPosts(response, 'nobody')).toBeNull())
})
