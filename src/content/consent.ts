import { profileOf } from '@/lib/parse'

export class ConsentGate<M> {
  creator: string | null = null
  decision: 'ask' | 'yes' | 'no' = 'ask'
  buffer: M[] = []

  receive(creator: string, msg: M): 'forward' | 'ask' | 'wait' | 'drop' {
    if (creator !== this.creator) this.reset(creator)
    if (this.decision === 'yes') return 'forward'
    if (this.decision === 'no') return 'drop'
    this.buffer.push(msg)
    return this.buffer.length === 1 ? 'ask' : 'wait'
  }

  accept(): M[] {
    const out = this.buffer
    this.decision = 'yes'
    this.buffer = []
    return out
  }

  decline() {
    this.decision = 'no'
    this.buffer = []
  }

  /** 網址變了。點開貼文（/p/、/reel/）還在同一個主頁上，不算離開；換到別的主播或別的頁面才算。回傳是否離開 */
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
