# brand-digest（Chrome 擴充功能）

滑過博主的 IG 主頁，就把他的短影音整理成知識庫。**不對 IG 多發任何請求**，帳號沒有被封的風險。

## 運作方式

```
你在博主主頁往下滑
  → 擴充功能記下 IG 已經傳給瀏覽器的貼文資料（音軌網址、文案、日期）
  → 按「開始萃取」：逐則下載音軌（不帶登入狀態，每則間隔 3–6 秒）
  → Groq Whisper 轉錄 → AI 萃取重點 → 跨篇整合成知識庫
  → 全部存在這台電腦的瀏覽器裡
```

- 只在博主**主頁**（`instagram.com/<帳號>/`）收集。Reels 分頁的資料沒有影片和文案，所以不收。
- 收集只「旁聽」IG 頁面自己收到的回應（`src/content/main-world.ts`），不發請求。
- 音軌一則約 350 KB，從 IG 的影片伺服器下載，和瀏覽器播放影片是同一種請求。
- IG 的影片網址幾天後會過期。過期的貼文回到博主主頁重新滑到，網址就會更新。

## 安裝（開發版）

1. `npm install`
2. `npm run build`，產出在 `dist/`
3. Chrome 網址列輸入 `chrome://extensions`，打開右上角「開發人員模式」
4. 按「載入未封裝項目」，選 `dist` 資料夾
5. 點工具列的 brand-digest 圖示，在設定填 Groq 金鑰（免費：https://console.groq.com/keys）

改了程式碼：`npm run build`，再到 `chrome://extensions` 按 brand-digest 的重新載入。

## 使用

1. 打開博主的主頁，往下滑到想要的範圍。工具列圖示的數字是已收集的則數。
2. 點工具列圖示，選那位博主，按「開始萃取」。處理中不要關閉那個分頁。
3. 完成後看「知識庫」分頁。每個知識點的 [編號] 對應文末的來源索引。

### 理論對位版（同一位博主的另一篇）

把博主零碎的經驗對位到既有理論，整理成可以照著做的公式。

1. 博主頁的分頁列旁邊按「＋ 理論對位」，輸入想學的主題。
2. AI 提出理論骨架。刪掉不相關的理論，補上漏掉的，再按「開始產生」。
3. 完成後多一個分頁「理論對位：主題」，不覆蓋知識庫。

內容：一句話總結、每個子原則的公式與適用條件、理論沒涵蓋的獨門心法、和理論不同之處、沒講到的子原則、飽和度。
額度在半路用完時，按「繼續產生」，已完成的步驟不會重做。

### 備份

在 `chrome://extensions` 移除擴充功能，會一併刪掉所有資料。
移除前到「設定 → 資料備份」按「匯出備份」，重新安裝後按「匯入備份」。備份不含金鑰。
每篇知識庫也可以按「下載 Markdown」存成檔案。

## 開發

| 指令 | 用途 |
|---|---|
| `npm run dev` | 在一般瀏覽器預覽介面（打開 `/app.html`；沒有 chrome.storage 時改用 localStorage） |
| `npm run build` | 型別檢查＋打包擴充功能到 `dist/` |
| `npm test` | 單元測試（解析 IG 回應、理論對位的文字處理） |

技術：TypeScript、React、Vite、Tailwind、shadcn/ui（Radix）。

| 檔案 | 作用 |
|---|---|
| `public/manifest.json` | 擴充功能設定 |
| `src/content/main-world.ts` | 在 IG 頁面旁聽 graphql 回應（MAIN world、document_start） |
| `src/content/bridge.ts` | 把收集到的貼文轉交背景程式 |
| `src/background.ts` | 存資料、更新工具列圖示的數字、打開主頁面 |
| `src/lib/parse.ts` | 從 IG 回應挑出這位博主的貼文 |
| `src/lib/pipeline.ts` | 下載音軌 → 轉錄 → 萃取 → 整合知識庫 |
| `src/lib/llm.ts` | 呼叫 Groq／Gemini／OpenAI／Anthropic，錯誤分類與自動重試 |
| `src/lib/prompts.ts` | 提示詞（移植自 Python 版 brand-digest） |
| `src/lib/theory.ts` | 理論對位：骨架 → 對位 → 組裝（移植自 Python 版的 pipeline/theory.py） |

## 還沒做（第二版）

問答、知識網絡。Python 版 brand-digest 已有這些功能，之後移植。
