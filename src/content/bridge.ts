// ISOLATED world：MAIN world 拿不到 chrome.runtime，由這裡把收集到的貼文轉交背景程式。
// 只接受同一頁面、標記為 brand-digest 的訊息。
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'brand-digest') return
  // 擴充功能重新載入或關閉後，舊分頁裡的這段程式還在，但 chrome.runtime 已經不能用：直接略過
  if (!chrome.runtime?.id) return
  chrome.runtime.sendMessage(e.data.msg).catch(() => {
    // 擴充功能剛更新、背景程式重啟中：這批略過，使用者再滑一下就會補上
  })
})
