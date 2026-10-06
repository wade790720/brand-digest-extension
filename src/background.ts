// 背景程式（service worker）：存下收集到的貼文、在工具列圖示上顯示這位博主收集了幾則、
// 點圖示打開主頁面。只處理資料，不對 IG 發任何請求。
import { mergeCollected } from '@/lib/store'
import type { CollectMessage } from '@/types'

// 收集訊息依序處理：IG 一次可能連續回好幾批，同時合併會讀到舊的索引而互相覆蓋
let queue = Promise.resolve()

chrome.runtime.onMessage.addListener((msg: CollectMessage, sender) => {
  if (msg?.type !== 'collect' || !sender.tab?.id) return
  const tabId = sender.tab.id
  queue = queue
    .then(() => mergeCollected(msg.creator, msg.fullName, msg.posts))
    .then(({ total }) => {
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#7c3aed' })
      chrome.action.setBadgeText({ tabId, text: String(total) })
      chrome.action.setTitle({ tabId, title: `brand-digest：已收集 ${msg.creator} 的 ${total} 則貼文` })
    })
    .catch((err) => console.error('收集失敗', err))
})

// 只開一個主頁面：開著就切過去
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('app.html')
  const [tab] = await chrome.tabs.query({ url })
  if (!tab?.id) return chrome.tabs.create({ url })
  chrome.tabs.update(tab.id, { active: true })
  chrome.windows.update(tab.windowId, { focused: true })
})
