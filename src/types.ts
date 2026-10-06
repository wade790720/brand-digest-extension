/** 一則收集到的貼文。由背景程式寫入（收集），由主頁面補上轉錄與萃取（處理）。 */
export interface Post {
  code: string // IG 貼文代碼，網址是 instagram.com/p/<code>/
  creator: string // 博主帳號
  takenAt: number // 發文時間（Unix 秒）
  caption: string
  audioUrl?: string // 只有音軌的檔案（DASH），轉錄用；IG 的簽章網址幾天後會過期
  videoUrl?: string // 沒有獨立音軌時的備用
  collectedAt: number // 收集時間（毫秒）
  status: 'new' | 'done' | 'error'
  transcript?: string
  digest?: Digest
  error?: string
}

/** 單則萃取結果。欄位名用英文，內容一律繁體中文。 */
export interface Digest {
  topic: string
  points: string[] // 可應用的知識點
  quotes: string[]
  terms: string[] // 工具、書、人名、專有名詞
  value: '高' | '中' | '低' // 含金量
}

export interface Creator {
  name: string
  fullName: string
  codes: string[] // 收集到的貼文，新的在前
}

export interface KnowledgeBase {
  markdown: string
  updatedAt: number
  postCount: number
}

/** 某個模型上次實際呼叫的結果，給設定的下拉選單顯示標籤 */
export interface ModelStatus {
  state: 'ok' | 'quota' | 'missing'
  at: number // 毫秒
}

export type Provider = 'groq' | 'gemini' | 'openai' | 'anthropic'

export interface Settings {
  provider: Provider
  keys: Partial<Record<Provider, string>>
  models: Record<Provider, string>
}

/** content script → 背景程式 */
export interface CollectMessage {
  type: 'collect'
  creator: string
  fullName: string
  posts: Omit<Post, 'status' | 'collectedAt'>[]
}
