// 在 IG 頁面的 MAIN world、document_start 執行：在 IG 的程式載入前接上 XHR/fetch，
// 「旁聽」IG 自己收到的 graphql 回應。這裡不發任何請求，只讀頁面本來就收到的資料。
import { extractPosts, profileOf } from '@/lib/parse'

const SOURCE = 'brand-digest'

function inspect(url: string, text: string) {
  if (!url.includes('graphql') || !text.includes('"code"')) return
  const creator = profileOf(location.pathname)
  if (!creator) return
  try {
    const msg = extractPosts(JSON.parse(text), creator)
    if (msg) window.postMessage({ source: SOURCE, msg }, location.origin)
  } catch {
    // 不是 JSON（例如串流格式）就略過；不能影響 IG 頁面本身
  }
}

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
