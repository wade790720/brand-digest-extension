// 背景程式（service worker）：存下收集到的貼文、在工具列圖示上顯示這位主播收集了幾則、
// 點圖示打開主頁面。只處理資料，不對 IG 發任何請求。
import { mergeCollected } from '@/lib/store'
import { browserLang, resolveLang, t } from '@/lib/i18n'
import type { CollectMessage, Settings } from '@/types'

// 收集訊息依序處理：IG 一次可能連續回好幾批，同時合併會讀到舊的索引而互相覆蓋
let queue = Promise.resolve()

chrome.runtime.onMessage.addListener((msg: CollectMessage, sender) => {
  if (msg?.type !== 'collect' || !sender.tab?.id) return
  const tabId = sender.tab.id
  queue = queue
    .then(() => mergeCollected(msg.creator, msg.fullName, msg.posts))
    .then(async ({ total }) => {
      const { settings } = (await chrome.storage.local.get('settings')) as { settings?: Settings }
      const lang = resolveLang(settings?.lang, browserLang())
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#c24700' }) // Chrome API 只收色碼：同 index.css 的 --primary
      chrome.action.setBadgeText({ tabId, text: String(total) })
      chrome.action.setTitle({ tabId, title: t('bg.title', { app: t('app.name', {}, lang), name: msg.creator, n: total }, lang) })
    })
    .catch((err) => console.error('collect failed', err))
})

// 第一次安裝就打開主頁面，直接看到三步引導。更新、重新載入不打開，免得打擾已經在用的人
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.tabs.create({ url: chrome.runtime.getURL('app.html') })
})

// 只開一個主頁面：開著就切過去
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('app.html')
  const [tab] = await chrome.tabs.query({ url })
  if (!tab?.id) return chrome.tabs.create({ url })
  chrome.tabs.update(tab.id, { active: true })
  chrome.windows.update(tab.windowId, { focused: true })
})
