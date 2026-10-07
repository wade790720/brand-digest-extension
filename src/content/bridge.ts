// ISOLATED world：MAIN world 拿不到 chrome.runtime，由這裡把收集到的貼文轉交背景程式。
// 只接受同一頁面、標記為 brand-digest 的訊息。
// 收集前先在頁面右下角問使用者：只是進來看一下，不該擅自收集。
import type { CollectMessage } from '@/types'
import { ConsentGate } from './consent'

const gate = new ConsentGate<CollectMessage>()
let toast: HTMLElement | null = null

// 擴充功能重新載入或關閉後，舊分頁裡的這段程式還在，但 chrome.runtime 已經不能用
const alive = () => !!chrome.runtime?.id

function send(msg: CollectMessage) {
  if (!alive()) return
  chrome.runtime.sendMessage(msg).catch(() => {
    // 背景程式重啟中：這批略過，使用者再滑一下就會補上
  })
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'brand-digest' || !alive()) return
  const msg: CollectMessage = e.data.msg
  const action = gate.receive(msg.creator, msg)
  if (action === 'forward') send(msg)
  if (action === 'ask') ask(msg.creator)
})

// ponytail: 每秒看一次網址判斷是否離開主頁（IG 是單頁應用，換頁不會重新載入）；要更即時再改用 Navigation API
setInterval(() => gate.navigate(location.pathname) && hide(), 1000)

async function ask(creator: string) {
  const known = alive() ? ((await chrome.storage.local.get(`creator:${creator}`))[`creator:${creator}`] as { codes: string[] } | undefined) : undefined
  if (gate.creator !== creator || gate.decision !== 'ask') return // 讀儲存的空檔裡已經離開或回答了
  show(
    known ? `要繼續收集「${creator}」的新貼文嗎？` : `要收集「${creator}」的貼文嗎？`,
    known
      ? `已收集 ${known.codes.length} 則。按「收集」後，這次往下滑看到的新貼文會加進 brand-digest。`
      : '按「收集」後，這次往下滑看到的貼文會存進 brand-digest，之後可以整理成知識庫。',
    [
      { label: '取消', primary: false, onClick: () => (gate.decline(), hide()) },
      {
        label: '收集', primary: true, onClick: () => {
          gate.accept().forEach(send)
          show('已開始收集', '往下滑，看到的貼文會陸續加進來。工具列圖示的數字是已收集的則數。', [])
          const shown = toast
          setTimeout(() => toast === shown && hide(), 3000) // 這 3 秒內換了別的提示就不關
        },
      },
    ],
  )
}

function show(title: string, body: string, buttons: { label: string; primary: boolean; onClick: () => void }[]) {
  hide()
  toast = document.createElement('div')
  const root = toast.attachShadow({ mode: 'closed' }) // 和 IG 的樣式互不影響
  root.innerHTML = `<style>
    .box { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; width: 340px; box-sizing: border-box;
      padding: 16px; border-radius: 12px; border: 1px solid rgb(255 255 255 / 12%); background: #18181b; color: #fafafa;
      font: 14px/1.6 system-ui, "Microsoft JhengHei", sans-serif; box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
      animation: in 200ms ease-out; }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } }
    @media (prefers-reduced-motion: reduce) { .box { animation: none; } }
    .brand { font-size: 12px; color: #a78bfa; font-weight: 600; }
    .title { margin: 2px 0 4px; font-weight: 600; }
    .body { margin: 0; color: #a1a1aa; font-size: 13px; }
    .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .row:empty { display: none; }
    button { font: inherit; font-weight: 600; padding: 6px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgb(255 255 255 / 15%); background: transparent; color: #fafafa; }
    button.primary { background: #7c3aed; border-color: #7c3aed; }
    button:hover { filter: brightness(1.15); }
    button:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
  </style>
  <div class="box" role="region" aria-live="polite" aria-label="brand-digest">
    <div class="brand">brand-digest</div>
    <p class="title"></p>
    <p class="body"></p>
    <div class="row"></div>
  </div>`
  root.querySelector('.title')!.textContent = title // 博主帳號用 textContent 放，不經過 innerHTML
  root.querySelector('.body')!.textContent = body
  for (const b of buttons) {
    const el = document.createElement('button')
    el.textContent = b.label
    if (b.primary) el.className = 'primary'
    el.addEventListener('click', b.onClick)
    root.querySelector('.row')!.append(el)
  }
  document.body.append(toast)
}

function hide() {
  toast?.remove()
  toast = null
}
