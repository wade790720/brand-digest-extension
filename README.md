# brand-digest

![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

滑過博主的 IG 主頁，就把他的短影音整理成知識庫的 Chrome 擴充功能。

## 目錄

- [背景](#背景)
- [安裝](#安裝)
- [使用](#使用)
  - [收集與萃取](#收集與萃取)
  - [理論對位版](#理論對位版)
  - [AI 與免費額度](#ai-與免費額度)
  - [備份](#備份)
  - [常見問題](#常見問題)
- [開發](#開發)
- [維護者](#維護者)

## 背景

短影音博主的知識散在幾百支影片裡，一支一支看很花時間。brand-digest 把影片轉成文字，萃取重點，再跨篇整合成一份知識庫。

這是 Python 版 brand-digest 的瀏覽器版本。Python 版用 instaloader 登入帳號，直接向 IG 發請求抓貼文，帳號容易被 IG 限制。擴充功能改用「旁聽」：

```
你在博主主頁往下滑
  → 擴充功能記下 IG 已經傳給瀏覽器的貼文資料（音軌網址、文案、日期）
  → 按「開始萃取」：逐則下載音軌（不帶登入狀態，每則間隔 3–6 秒）
  → Groq Whisper 轉錄 → AI 萃取重點 → 跨篇整合成知識庫
  → 全部存在這台電腦的瀏覽器裡
```

- 擴充功能不對 IG 多發任何請求。它只讀 IG 頁面本來就收到的回應（`src/content/main-world.ts`）。
- 只在博主**主頁**（`instagram.com/<帳號>/`）收集。Reels 分頁的資料沒有影片和文案，所以不收。
- 音軌一則約 350 KB，從 IG 的影片伺服器下載。這和瀏覽器播放影片是同一種請求。
- 處理過的貼文不會重做。博主有新貼文時，再滑一次主頁，只有新貼文會加進來。

## 安裝

### 需要的環境

| 項目 | 版本 | 說明 |
|---|---|---|
| Chrome | 116 以上 | 其他 Chromium 瀏覽器（Edge、Brave）應該也能用，沒有測過 |
| Node.js | 22 以上 | 開發時用 22.23 |
| npm | 10 以上 | Node.js 內附 |
| Groq 金鑰 | — | 必填，轉錄用。到 https://console.groq.com/keys 免費申請 |
| 其他 AI 金鑰 | — | 選填。Gemini、OpenAI、Anthropic 擇一，用來整理重點 |

Windows、macOS、Linux 的步驟都一樣。

### 步驟

1. 安裝套件：

   ```bash
   npm install
   ```

2. 打包擴充功能。產出在 `dist/`：

   ```bash
   npm run build
   ```

3. Chrome 網址列輸入 `chrome://extensions`，打開右上角的「開發人員模式」。
4. 按「載入未封裝項目」，選 `dist` 資料夾。
5. 點工具列的 brand-digest 圖示。第一次開啟會跳出設定，填入 Groq 金鑰。

改了程式碼之後，執行 `npm run build`，再到 `chrome://extensions` 按 brand-digest 的重新載入。

## 使用

### 收集與萃取

1. 打開博主的主頁，往下滑到想要的範圍。工具列圖示的數字是已收集的則數。
2. 點工具列圖示，選那位博主，按「開始萃取」。處理中不要關閉這個分頁，可以切到別的分頁。
3. 完成後看「知識庫」分頁。
   - 每個知識點後面的 [編號] 可以點，點了會捲到文末「來源索引」的那一則。
   - 按「下載 Markdown」可以存成檔案。

中途停下時，畫面會顯示原因。已完成的貼文都有保存，下次按「開始萃取」只處理剩下的。

### 理論對位版

把博主零碎的經驗對位到既有理論，整理成可以照著做的公式。結果是另一個分頁，不覆蓋知識庫。

1. 在分頁列旁邊按「＋ 理論對位」。
2. 輸入想學的主題，例如「黃金投資時機」。不填就用「全部內容」。
3. 按「請 AI 提出理論骨架」。刪掉不相關的理論，補上漏掉的。
4. 按「開始產生」。完成後多一個分頁「理論對位：主題」。

內容包含：一句話總結、每個子原則的公式與適用條件、理論沒涵蓋的獨門心法、和理論不同之處、沒講到的子原則、飽和度（前幾則就講完 80% 的觀念）。

額度在半路用完時，按「繼續產生」。已完成的步驟不會重做。

### AI 與免費額度

每則貼文用到兩種 AI：

| 步驟 | 用哪個 | 在哪裡選 |
|---|---|---|
| 轉錄：影片聲音轉成文字 | 固定用 Groq Whisper | 不能換 |
| 萃取重點、整合知識庫、理論對位 | Groq、Gemini、OpenAI、Anthropic 擇一 | 設定 →「整理重點用的 AI」 |

- 模型額度用完時，程式自動換同一家的下一個模型繼續。所有模型都用完才停下。
- 轉錄的兩個模型（`whisper-large-v3-turbo`、`whisper-large-v3`）額度分開算，每天合計約 16 小時音訊。
- 設定的模型選單會標示每個模型上次的結果：可用、額度用完（附恢復時間）、無法使用、還沒用過。
- 建議：萃取用 Groq，整合知識庫和理論對位用 Gemini。Gemini 一次能讀 6 萬字，整合 200 多則只要幾次請求。

### 備份

在 `chrome://extensions` 按「移除」，會一併刪掉所有資料。按「重新載入」不會刪資料。

- 移除前到「設定 → 資料備份」按「匯出備份」，存成 `.json` 檔。
- 重新安裝後按「匯入備份」。本機已完成的貼文，不會被備份裡未完成的版本蓋掉。
- 備份不含金鑰，重新安裝後要重填。

### 常見問題

**萃取停下，顯示「今天的免費額度用完了」**
等額度恢復再按「開始萃取」。Groq 的額度是滾動 24 小時計算。Gemini 在美國太平洋時間午夜重置：台灣時間夏令期間（3 月到 11 月初）是下午 3 點，其他時間是下午 4 點。

**貼文失敗，顯示「影片連結已過期」**
IG 的影片網址幾天後會過期。回到博主主頁重新滑到那則，網址就會更新，再按一次「開始萃取」。

**IG 博主主頁顯示「發生錯誤，無法載入頁面」**
先在 `chrome://extensions` 關掉 brand-digest，重新整理頁面。關掉後還是錯誤，代表是 IG 那邊的問題。用無痕視窗打開正常，代表 IG 暫時限制了你的帳號，等 1–2 天通常會解除。

## 開發

| 指令 | 用途 |
|---|---|
| `npm run dev` | 在一般瀏覽器預覽介面。打開 `/app.html`。沒有 `chrome.storage` 時改用 `localStorage` |
| `npm run build` | 型別檢查，再打包擴充功能到 `dist/` |
| `npm test` | 單元測試：解析 IG 回應、理論對位的文字處理、自動換模型 |
| `npm run lint` | 用 oxlint 檢查程式碼 |

技術：TypeScript、React、Vite、Tailwind CSS v4、shadcn/ui（Radix UI）。

| 檔案 | 作用 |
|---|---|
| `public/manifest.json` | 擴充功能設定 |
| `src/content/main-world.ts` | 在 IG 頁面旁聽 graphql 回應（MAIN world、document_start） |
| `src/content/bridge.ts` | 把收集到的貼文轉交背景程式 |
| `src/background.ts` | 存資料、更新工具列圖示的數字、打開主頁面 |
| `src/lib/parse.ts` | 從 IG 回應挑出這位博主的貼文 |
| `src/lib/pipeline.ts` | 下載音軌 → 轉錄 → 萃取 → 整合知識庫，AI 回應的暫存 |
| `src/lib/llm.ts` | 呼叫 Groq、Gemini、OpenAI、Anthropic，錯誤分類、自動重試、自動換模型 |
| `src/lib/prompts.ts` | 萃取與整合的提示詞（移植自 Python 版） |
| `src/lib/theory.ts` | 理論對位：骨架 → 對位 → 組裝（移植自 Python 版的 `pipeline/theory.py`） |
| `src/lib/store.ts` | 讀寫 `chrome.storage.local`、備份 |

資料全部存在 `chrome.storage.local`：

| 儲存鍵 | 內容 |
|---|---|
| `creator:<帳號>` | 博主和他的貼文清單 |
| `post:<貼文代碼>` | 文案、轉錄文字、萃取結果、處理狀態 |
| `kb:<帳號>` | 知識庫 |
| `theory:<帳號>` | 理論對位版，一個主題一篇 |
| `cache:<範圍>` | 整理途中的 AI 回應暫存，完成後清掉 |
| `settings`、`modelStatus` | 設定、金鑰、各模型上次的結果 |

還沒做：問答、知識網絡。Python 版已有這些功能，之後移植。

## 維護者

[@wade790720](https://github.com/wade790720)
