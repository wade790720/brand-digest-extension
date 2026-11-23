import type { LangSetting } from '@/lib/i18n'
export interface Post {
  code: string
  creator: string
  takenAt: number // 發文時間（Unix 秒）
  caption: string
  audioUrl?: string // 只有音軌的檔案（DASH），轉錄用；IG 的簽章網址幾天後會過期
  videoUrl?: string
  collectedAt: number
  status: 'new' | 'done' | 'error'
  transcript?: string
  digest?: Digest
  error?: string
  processedAt?: number
  stats?: PostStats
  script?: ScriptBreakdown
  thumbUrl?: string // IG 的縮圖網址，幾天後會過期；萃取時下載一次，縮小後存進 thumb
  thumb?: string
}

export interface PostStats {
  likes?: number
  comments?: number
  plays?: number
}

export interface ScriptBreakdown {
  hook: string
  hookType: string
  beats: { role: string; text: string }[]
  cta: string
  ctaType: string
  captionFormula: string
  techniques: string[]
}

export interface Playbook {
  markdown: string
  updatedAt: number
  postCount: number
}

export interface Digest {
  topic: string
  points: string[]
  quotes: string[]
  terms: string[]
  value: '高' | '中' | '低'
  hookType?: string
}

export interface Creator {
  name: string
  fullName: string
  codes: string[]
}

export interface KnowledgeBase {
  markdown: string
  updatedAt: number
  postCount: number
}

export interface ModelStatus {
  state: 'ok' | 'quota' | 'missing'
  at: number
}

export interface Theory {
  id: string
  name: string
  source: string
  principles: { id: string; name: string }[]
}

export interface TheoryDoc {
  topic: string
  skeleton: Theory[]
  markdown?: string
  updatedAt?: number
}

export type Provider = 'groq' | 'gemini' | 'openai' | 'anthropic'

export interface Settings {
  provider: Provider
  keys: Partial<Record<Provider, string>>
  models: Record<Provider, string>
  clubDismissed?: boolean
  lang?: LangSetting
}

export interface CollectMessage {
  type: 'collect'
  creator: string
  fullName: string
  posts: Omit<Post, 'status' | 'collectedAt'>[]
}
