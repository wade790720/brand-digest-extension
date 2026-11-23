import { mergeCollected } from '@/lib/store'
import { browserLang, resolveLang, t } from '@/lib/i18n'
import type { CollectMessage, Settings } from '@/types'

chrome.runtime.onMessage.addListener((msg: CollectMessage, sender) => {
  if (msg?.type !== 'collect' || !sender.tab?.id) return
  const tabId = sender.tab.id
  mergeCollected(msg.creator, msg.fullName, msg.posts)
    .then(async ({ total }) => {
      const { settings } = (await chrome.storage.local.get('settings')) as { settings?: Settings }
      const lang = resolveLang(settings?.lang, browserLang())
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#c24700' }) // Chrome API 只收色碼：同 index.css 的 --primary
      chrome.action.setBadgeText({ tabId, text: String(total) })
      chrome.action.setTitle({ tabId, title: t('bg.title', { app: t('app.name', {}, lang), name: msg.creator, n: total }, lang) })
    })
    .catch((err) => console.error('collect failed', err))
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.tabs.create({ url: chrome.runtime.getURL('app.html') })
})

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('app.html')
  const [tab] = await chrome.tabs.query({ url })
  if (!tab?.id) return chrome.tabs.create({ url })
  chrome.tabs.update(tab.id, { active: true })
  chrome.windows.update(tab.windowId, { focused: true })
})
