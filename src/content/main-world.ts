// MAIN world、document_start：要在 IG 的程式拿到 XHR/fetch 之前換掉它們。
import { profileOf } from '@/lib/parse'
import { createCollector } from './collector'

const SOURCE = 'brand-digest'

const collect = createCollector((msg) => window.postMessage({ source: SOURCE, msg }, location.origin))

function inspect(url: string, text: string) {
  if (!url.includes('graphql')) return
  const creator = profileOf(location.pathname)
  if (creator) collect(text, creator)
}

// 打開主頁時，最上面一批貼文常直接寫在網頁的 <script type="application/json"> 裡，不經過 graphql 請求
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const text = s.textContent ?? ''
    if (text.includes('media_type') || text.includes('profile_pic_url')) inspect('embedded:graphql', text)
  }
})

const origOpen = XMLHttpRequest.prototype.open
const origSend = XMLHttpRequest.prototype.send
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __bdUrl?: string }, ...args: any[]) {
  this.__bdUrl = String(args[1])
  return (origOpen as any).apply(this, args)
}
XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __bdUrl?: string }, ...args: any[]) {
  this.addEventListener('load', () => {
    if (this.responseType === '' || this.responseType === 'text') inspect(this.__bdUrl ?? '', this.responseText)
  })
  return (origSend as any).apply(this, args)
}

const origFetch = window.fetch
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const res = await origFetch.apply(this, args)
  const url = args[0] instanceof Request ? args[0].url : String(args[0])
  if (url.includes('graphql')) res.clone().text().then((t) => inspect(url, t), () => {})
  return res
}
