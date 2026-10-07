import { profileOf } from '@/lib/parse'

/** 收集前先問使用者。一次瀏覽（停在同一位博主的主頁）只問一次；離開主頁再回來，重新問。
 *  按收集之前收到的資料先暫存，按收集就一起送出，按取消就丟掉。 */
export class ConsentGate<M> {
  creator: string | null = null
  decision: 'ask' | 'yes' | 'no' = 'ask'
  buffer: M[] = []

  /** 收到某位博主的一批貼文。回傳要做的事：forward 直接送出、ask 第一次收到要跳出詢問、wait 等使用者回答、drop 丟掉 */
  receive(creator: string, msg: M): 'forward' | 'ask' | 'wait' | 'drop' {
    if (creator !== this.creator) this.reset(creator)
    if (this.decision === 'yes') return 'forward'
    if (this.decision === 'no') return 'drop'
    this.buffer.push(msg)
    return this.buffer.length === 1 ? 'ask' : 'wait'
  }

  /** 按收集：回傳暫存的資料，之後收到的直接送出 */
  accept(): M[] {
    const out = this.buffer
    this.decision = 'yes'
    this.buffer = []
    return out
  }

  /** 按取消：這次瀏覽都不收集 */
  decline() {
    this.decision = 'no'
    this.buffer = []
  }

  /** 網址變了。點開貼文（/p/、/reel/）還在同一個主頁上，不算離開；換到別的博主或別的頁面才算。回傳是否離開 */
  navigate(pathname: string): boolean {
    if (this.creator === null || /^\/(p|reel)\//.test(pathname) || profileOf(pathname) === this.creator) return false
    this.reset(null)
    return true
  }

  private reset(creator: string | null) {
    this.creator = creator
    this.decision = 'ask'
    this.buffer = []
  }
}
