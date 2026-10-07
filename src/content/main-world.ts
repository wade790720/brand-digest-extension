// 在 IG 頁面的 MAIN world、document_start 執行：在 IG 的程式載入前接上 XHR/fetch，
// 「旁聽」IG 自己收到的 graphql 回應。這裡不發任何請求，只讀頁面本來就收到的資料。
import { extractPosts, profileOf } from '@/lib/parse'

const SOURCE = 'brand-digest'

function inspect(url: string, text: string) {
  if (!url.includes('graphql') || !text.includes('"code"')) return
  const creator = profileOf(location.pathname)
  if (!creator) return
  for (const json of parseAll(text)) {
    const msg = extractPosts(json, creator)
    if (msg) window.postMessage({ source: SOURCE, msg }, location.origin)
  }
}

/** 一般 JSON 直接解析；串流格式（好幾段 JSON 一行一段）就逐行解析。解析不了的略過，不能影響 IG 頁面本身 */
function parseAll(text: string): unknown[] {
  const tryParse = (t: string) => {
    try {
      return [JSON.parse(t)]
    } catch {
      return []
    }
  }
  const whole = tryParse(text.replace(/^for \(;;\);/, ''))
  return whole.length ? whole : text.split('\n').flatMap((line) => (line.includes('"code"') ? tryParse(line) : []))
}

// 打開主頁時，最上面一批貼文常直接寫在網頁的 <script type="application/json"> 裡，不經過 graphql 請求
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const text = s.textContent ?? ''
    if (text.includes('media_type')) inspect('embedded:graphql', text)
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
