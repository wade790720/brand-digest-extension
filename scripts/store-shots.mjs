// Chrome Web Store screenshots, 1280x800, from the dev preview with made-up demo data written into localStorage.
//   node scripts/store-shots.mjs [out-dir]        (default: the next free ../store-assets/<repo>/vN)
// Writes tw/ and en/: screenshot-1.png … 5 (one highlight each, the app inside the store frame),
// plus promo-small.png, promo-marquee.png and the promo-shot.png they use.
// Never writes into a folder that exists, so earlier versions stay as they were.
// Drives the installed Chrome over the DevTools protocol, so it needs no extra npm package. Set CHROME to override its path.
// The demo creator, posts and documents are fictional. The page may only talk to the local dev server; any other request is blocked.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const ASSETS = resolve(ROOT, '../store-assets', basename(ROOT))
const nextVersion = () => { let n = 1; while (existsSync(join(ASSETS, `v${n}`))) n++; return join(ASSETS, `v${n}`) }
const OUT = resolve(process.argv[2] ?? nextVersion())
if (existsSync(OUT)) throw new Error(`${OUT} already exists; pick a new folder so the old shots are kept`)
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5188, DEBUG = 9334
const APP = `http://localhost:${PORT}/app.html`
const HANDLE = 'slowbuild.studio'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

// ---------- demo data ----------

const HUES = [18, 200, 330, 150, 40, 262, 175, 0, 220, 300, 95, 240, 130, 280, 55, 190, 345, 110]
const thumb = (i, word) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320" viewBox="0 0 180 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop stop-color="hsl(${HUES[i]} 70% 62%)"/><stop offset="1" stop-color="hsl(${(HUES[i] + 40) % 360} 65% 38%)"/></linearGradient></defs>` +
  `<rect width="180" height="320" fill="url(#g)"/><circle cx="140" cy="60" r="70" fill="#fff" opacity=".12"/><circle cx="30" cy="250" r="90" fill="#000" opacity=".08"/>` +
  `<rect x="18" y="214" width="144" height="58" rx="10" fill="#000" opacity=".28"/>` +
  `<text x="90" y="243" dominant-baseline="central" text-anchor="middle" font-family="Segoe UI, Microsoft JhengHei, sans-serif" font-size="${fit(word)}" font-weight="800" fill="#fff">${word}</text></svg>`)
// The label box is 144px wide: shrink long words so they keep 10px of padding on each side.
// shortcut: CJK counted as 1em and everything else as 0.6em; measure with canvas if a word still touches the edge.
function fit(word) {
  const em = [...word].reduce((n, c) => n + (/[\u2E80-\uFFEF]/.test(c) ? 1 : 0.6), 0)
  return Math.min(26, Math.floor(124 / em))
}
const avatar = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6a35c"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs>' +
  '<rect width="96" height="96" fill="url(#a)"/><circle cx="48" cy="38" r="17" fill="#fff" opacity=".9"/><ellipse cx="48" cy="88" rx="30" ry="24" fill="#fff" opacity=".9"/></svg>')

// hookType and value are stored in Chinese in both languages; the app translates them for display.
const POSTS = [
  { hook: '結果先行', plays: 61200, likes: 2980, zh: ['砍工時', '我把每週工時從 60 砍到 40', '先刪掉流程，剩下的才值得自動化'], en: ['60→40', 'I cut my week from 60 hours to 40', 'Delete a step before you automate it'] },
  { hook: '提問', plays: 28400, likes: 1310, zh: ['深度時段', '你每天有兩小時不被打斷嗎？', '早上 9 到 11 點只做最難的事'], en: ['Deep 2h', 'Do you get two hours without interruptions?', 'Use 9 to 11 a.m. for the hardest task only'] },
  { hook: '痛點', plays: 22600, likes: 1020, zh: ['訊息地獄', '一直回訊息，店卻沒長大', '訊息一天只集中回三次'], en: ['Inbox', 'Answering messages all day, and the shop stays small', 'Answer messages in three fixed blocks a day'] },
  { hook: '反常識', plays: 44100, likes: 2140, zh: ['少做一點', '越努力的老闆，店越難長大', '每週五挑一件事，下週停掉'], en: ['Do less', 'The hardest-working owners grow the slowest', 'Every Friday, pick one task to stop next week'] },
  { hook: '數字清單', plays: 15300, likes: 640, zh: ['三問定價', '定價前先問這三個問題', '客人怕什麼、省多少、別家怎麼收'], en: ['3 questions', 'Ask these three questions before you set a price', 'What they fear, what they save, what others charge'] },
  { hook: '痛點', plays: 21200, likes: 940, zh: ['低價陷阱', '最便宜的客人最花時間', '低價客人最花時間，利潤也最薄'], en: ['Cheap trap', 'Your cheapest customers cost you the most time', 'Cheap customers take the most time for the least profit'] },
  { hook: '結果先行', plays: 52800, likes: 2460, zh: ['兩小時', '每天兩小時，營收多了三成', '兩小時專注抵得過一整天切來切去'], en: ['2 hours', 'Two focused hours a day, 30% more revenue', 'Two uninterrupted hours beat a day of switching'] },
  { hook: '反常識', plays: 38900, likes: 1760, zh: ['只講一件', '一支影片講越多，越沒人看完', '一支影片只講一件事'], en: ['One idea', 'The more a video covers, the fewer people finish it', 'One video, one idea'] },
  { hook: '提問', plays: 27000, likes: 1190, zh: ['報價', '你報價前有算過這個嗎？', '報價前先算客人省下的時間和錢'], en: ['Quote', 'Do you work this out before you quote?', 'Price by the time and money the customer saves'] },
  { hook: '反常識', plays: 35800, likes: 1710, zh: ['別急著自動化', '別急著買自動化工具', '把錯的流程變快，只會更快做錯'], en: ['Not yet', "Don't buy an automation tool yet", 'Automating a bad process just makes mistakes faster'] },
  { hook: '提問', plays: 26800, likes: 1220, zh: ['開頭三秒', '觀眾為什麼三秒就滑走？', '開頭三秒先講結論'], en: ['3 seconds', 'Why do viewers swipe away in three seconds?', 'Say the conclusion in the first three seconds'] },
  { hook: '結果先行', plays: 30600, likes: 1490, zh: ['問答變內容', '這招讓我一個月拍 20 支', '客人問過三次的問題，就拍成一支'], en: ['FAQ videos', 'How I make 20 videos a month', 'A question asked three times becomes a video'] },
  { hook: '結果先行', plays: 47800, likes: 2210, zh: ['週休二日', '開店三年，我終於週休二日', '把例行工作寫成清單交給夥伴'], en: ['Weekends', 'Three years in, I finally take weekends off', 'Write routines as checklists your team can run'] },
  { hook: '反常識', plays: 33100, likes: 1590, zh: ['慢慢回', '別秒回客人訊息', '秒回會讓客人以為你隨時在線'], en: ['Slow reply', "Don't reply to customers instantly", 'Instant replies teach customers you are always on'] },
  { hook: '提問', plays: 24900, likes: 1130, zh: ['最卡的一步', '你知道店裡最卡的是哪一步嗎？', '先找出最慢的一步，再談改善'], en: ['Bottleneck', 'Do you know the slowest step in your shop?', 'Find the slowest step before improving anything'] },
  { hook: '結果先行', plays: 55400, likes: 2620, zh: ['漲價', '漲價兩成，客人反而變多', '漲價省下的時間，拿來服務最好的客人'], en: ['Raise prices', 'I raised prices 20% and got more customers', 'Spend the time a price rise frees on your best customers'] },
  { hook: '反常識', plays: 41200, likes: 1930, zh: ['品項砍半', '品項砍一半，營收沒掉', '砍掉賣得少又花時間的品項'], en: ['Fewer items', 'I cut half my menu and revenue held', 'Drop items that sell little and take time'] },
  { hook: '提問', plays: 23800, likes: 1080, zh: ['第一件事', '你每天第一件事做什麼？', '第一件事做最重要的，不是收信'], en: ['First task', 'What is the first thing you do each day?', 'Start with the most important task, not email'] },
]
const codes = POSTS.map((_, i) => `DEMO${String(i + 1).padStart(2, '0')}`)

const sources = (lang) => `## ${lang === 'zh' ? '來源索引' : 'Sources'}\n\n` +
  POSTS.map((p, i) => `${i + 1}. ${p[lang][1]} — [${lang === 'zh' ? '看原文' : 'View post'}](https://www.instagram.com/p/${codes[i]}/)`).join('\n')

function statsTable(lang) {
  const groups = new Map()
  for (const p of POSTS) groups.set(p.hook, [...(groups.get(p.hook) ?? []), p])
  const label = { 結果先行: 'Result first', 提問: 'Question', 痛點: 'Pain point', 反常識: 'Contrarian', 數字清單: 'Numbered list' }
  const avg = (ps, k) => Math.round(ps.reduce((n, p) => n + p[k], 0) / ps.length)
  const rows = [...groups].map(([h, ps]) => [lang === 'zh' ? h : label[h], ps.length, avg(ps, 'plays'), avg(ps, 'likes')]).sort((a, b) => b[2] - a[2])
  return [
    `## ${lang === 'zh' ? '哪種 Hook 表現最好' : 'Which hooks work best'}`, '',
    lang === 'zh' ? '| Hook 類型 | 則數 | 平均播放 | 平均按讚 |' : '| Hook type | Posts | Avg plays | Avg likes |', '|---|---|---|---|',
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2].toLocaleString('en')} | ${r[3].toLocaleString('en')} |`), '',
    `_${lang === 'zh' ? '數字是收集當下 IG 顯示的數字。則數少的類型參考價值低。' : 'Numbers are what Instagram showed at collection time. Hook types with few posts are less reliable.'}_`,
  ].join('\n')
}

const KB = {
  zh: `_共 18 則_

## 這個創作者在教什麼

- 小店老闆不缺努力，缺的是先刪掉不該做的事 [1][4]
- 每天兩小時專心做最難的事，比加班更能讓生意長大 [2][7]

## 核心方法論

1. 重點｜**先刪再快**：任何流程先問能不能整個拿掉，剩下的才值得自動化 [1][10]
2. 做法｜**兩小時深度時段**：早上 9 點到 11 點不接訊息、不開會，只做最難的一件事 [2][7]
3. 做法｜**三問定價法**：先問客人怕什麼、能省下多少、別家怎麼收，再決定價格 [5][9]
4. 照做｜**每週五刪一件**：列出這週做過的事，挑一件下週停掉 [4]
5. 留意｜**太早自動化**：把錯的流程變快，只會更快做錯 [10]

> 你的行事曆，就是你真正的優先順序。[2]

## 主題聚類

### 時間管理

- 重點｜**專注比時數重要**：兩小時不被打斷，抵得過一整天切來切去 [2][7]
- 做法｜**訊息集中回**：一天固定三個時段回覆，其他時間通知全關 [3]

### 定價與客戶

- 做法｜**價格跟著價值走**：報價前先算客人省下的時間和錢 [5][9]
- 留意｜**低價搶客**：最便宜的客人最花時間，利潤也最薄 [6]

### 內容經營

- 照做｜**一支影片只講一件事**：開頭三秒就說結論 [8][11]
- 做法｜**把問答變內容**：客人問過三次的問題，就拍成一支 [12]

## 可行動清單

- [ ] 明天早上排出 9 到 11 點的深度時段 [2]
- [ ] 列出三件可以停掉的例行工作 [4]
- [ ] 下一次報價前，先算客人省下的時間 [5]
- [ ] 把最常被問的問題拍成一支影片 [12]

${sources('zh')}
`,
  en: `_18 posts_

## What this creator teaches

- Small shop owners work hard enough; what they lack is deleting the work that doesn't matter [1][4]
- Two focused hours on the hardest task each day grow a business more than overtime [2][7]

## Core methods

1. Key | **Delete before you speed up**: ask whether a step can go entirely; only what remains is worth automating [1][10]
2. How | **A two-hour deep block**: from 9 to 11 a.m., no messages and no meetings, only the hardest task [2][7]
3. How | **Three-question pricing**: ask what the customer fears, what they save and what others charge, then set the price [5][9]
4. Do | **Drop one task every Friday**: list this week's tasks and stop one of them next week [4]
5. Watch | **Automating too early**: making a bad process faster only makes mistakes faster [10]

> Your calendar is your real list of priorities. [2]

## Topic groups

### Time

- Key | **Focus beats hours**: two uninterrupted hours beat a whole day of switching [2][7]
- How | **Batch your messages**: answer in three fixed blocks a day and mute everything else [3]

### Pricing and customers

- How | **Price follows value**: before you quote, work out the time and money the customer saves [5][9]
- Watch | **Winning on price**: the cheapest customers take the most time for the thinnest margin [6]

### Content

- Do | **One video, one idea**: say the conclusion in the first three seconds [8][11]
- How | **Turn questions into videos**: a question customers ask three times becomes a video [12]

## Action list

- [ ] Block 9 to 11 a.m. tomorrow for deep work [2]
- [ ] List three routine tasks you can stop [4]
- [ ] Before your next quote, work out the time the customer saves [5]
- [ ] Film the question you hear most often [12]

${sources('en')}
`,
}

const PLAYBOOK = {
  zh: `_共 18 則的腳本拆解。這份只分析寫法，知識內容在「知識庫」分頁。_

${statsTable('zh')}

## 一句話總結

用**結果先行的開場**先給答案，再用三段式腳本講清楚做法，結尾只留一個行動 [1][7]

## Hook 模式

1. **結果先行**：開頭直接講成果，例如「我把每週工時從 60 砍到 40」[1][7][12]
   - 為什麼有效：觀眾先看到好處，才願意聽方法
   - 填空範本：「我用＿＿，把＿＿從＿＿變成＿＿。」
2. **反常識**：推翻觀眾的直覺，例如「越努力的老闆，店越難長大」[4][8][10]
   - 填空範本：「大家都說＿＿，其實＿＿。」
3. **提問**：用觀眾自己會問的問題開場，例如「你每天有兩小時不被打斷嗎？」[2][9][11]
   - 填空範本：「你是不是也＿＿？」

## 腳本結構範本

**三段式：結論 → 原因 → 一個步驟**

1. 結論（0 到 3 秒）：一句話講成果或主張
2. 原因（3 到 20 秒）：用自己做錯過的例子說明為什麼
3. 步驟（20 到 40 秒）：只給一個今天就能做的動作

適用：教學型短片，一支只講一件事 [2][7][8]

## CTA 與文案公式

- **單一行動**：結尾只請觀眾做一件事，例如「留言『時間』拿排程表」[9]
- **文案第一行重複結論**：讓沒開聲音的人也看得懂 [11]

## 說服手法

- **具體數字**：用「60 小時變 40 小時」取代「省很多時間」[1][7]
- **先講自己做錯**：先承認失敗，再講改法，觀眾比較願意相信 [6][10]

## 可以照做的清單

- [ ] 下一支影片開頭三秒先講結論 [1]
- [ ] 用三段式寫一支腳本 [2]
- [ ] 文案第一行改成影片的結論 [11]

${sources('zh')}
`,
  en: `_Script breakdown of 18 posts. This covers how the creator speaks. The knowledge is in the Knowledge base tab._

${statsTable('en')}

## One-line summary

Open with **the result first**, explain the method in three beats, and end with one action [1][7]

## Hook patterns

1. **Result first**: lead with the outcome, like "I cut my week from 60 hours to 40" [1][7][12]
   - Why it works: viewers see the payoff before they hear the method
   - Template: "I used ___ to take ___ from ___ to ___."
2. **Contrarian**: break the viewer's assumption, like "The hardest-working owners grow the slowest" [4][8][10]
   - Template: "Everyone says ___. Actually ___."
3. **Question**: open with a question the viewer already asks, like "Do you get two hours without interruptions?" [2][9][11]
   - Template: "Do you also ___?"

## Script templates

**Three beats: conclusion, reason, one step**

1. Conclusion (0 to 3 s): one line with the result or the claim
2. Reason (3 to 20 s): a mistake they made that shows why
3. Step (20 to 40 s): one action the viewer can take today

Use it for teaching videos with one idea each [2][7][8]

## CTA and caption formulas

- **One action**: end with a single ask, like "Comment 'time' for the schedule" [9]
- **First caption line repeats the conclusion**: people watching muted still get it [11]

## Persuasion techniques

- **Concrete numbers**: "60 hours to 40" instead of "a lot less time" [1][7]
- **Admit the mistake first**: owning a failure makes the fix believable [6][10]

## Checklist

- [ ] Say the conclusion in the first three seconds of the next video [1]
- [ ] Write one script in three beats [2]
- [ ] Make the first caption line the video's conclusion [11]

${sources('en')}
`,
}

const THEORY = {
  zh: { topic: '時間管理', markdown: `_理論對位版｜主題：時間管理｜18 則、46 條碎片，35 條掛上理論或獨門心法；9 個子原則中 7 個有對應。_

_飽和度：依發文時間，前 6 則（33%）就涵蓋了 80% 的觀念，全部 18 則共 17 個觀念。_

## 一句話總結

他的時間法，其實就是**深度工作**加上**機會成本**的小店版 [2][7]

## 理論對位：原來在說這個

### 深度工作（Cal Newport，《Deep Work》）

**深度時段**

- 公式：1. 固定時段 2. 關掉通知 3. 只做一件最難的事
- 創作者怎麼說：每天 9 到 11 點不回訊息，只做最難的事 [2][7]
- 為什麼有效：注意力切換有成本，連續專注才做得出高價值的成果
- 適用條件：需要思考的工作有效；顧店的時段要先找人代班

**淺薄工作批次處理**

- 公式：1. 把回訊息、對帳歸成一類 2. 排進固定時段一次做完
- 創作者怎麼說：訊息一天只集中回三次 [3]
- 為什麼有效：少切換幾次，就少浪費幾次重新進入狀況的時間

### 機會成本（經濟學）

**先刪除再優化**

- 公式：1. 列出所有工作 2. 估每件的價值 3. 刪掉最低的再談效率
- 創作者怎麼說：先刪掉流程，剩下的才值得自動化 [1][10]
- 為什麼有效：時間固定，做了 A 就放棄了 B

## 獨門心法

- **每週五刪一件**：理論只說要取捨，他給了固定的刪除時間點 [4]

## 和理論不一樣的地方

- 深度工作建議每天四小時，他主張小店老闆**兩小時就夠**，因為白天還要顧店 [7]

## 沒講到的

- **團隊怎麼一起保護深度時段**：他的方法都是一個人的版本

${sources('zh')}
` },
  en: { topic: 'Time management', markdown: `_Theory map | Topic: Time management | 18 posts, 46 points. 35 points map to a theory or a unique insight. 7 of 9 principles have a match._

_Saturation: by post date, the first 6 posts (33%) cover 80% of the ideas. All 18 posts hold 17 ideas._

## One-line summary

Their time method is **deep work** plus **opportunity cost**, sized for a small shop [2][7]

## Theory map: what they really mean

### Deep work (Cal Newport, Deep Work)

**Deep blocks**

- Formula: 1. Fix a time 2. Mute notifications 3. Do only the hardest task
- How the creator puts it: from 9 to 11 a.m., no messages, only the hardest task [2][7]
- Why it works: every switch of attention costs time, and valuable work needs unbroken focus
- When to use it: thinking work; cover the shop with someone else during the block

**Batch shallow work**

- Formula: 1. Group messages and bookkeeping 2. Do them in fixed blocks
- How the creator puts it: answer messages in three blocks a day [3]
- Why it works: fewer switches mean less time spent getting back into the task

### Opportunity cost (economics)

**Delete before you optimize**

- Formula: 1. List every task 2. Estimate each one's value 3. Delete the lowest before speeding anything up
- How the creator puts it: delete a step before you automate it [1][10]
- Why it works: time is fixed, so choosing A means giving up B

## Unique insights

- **Drop one task every Friday**: theory says to choose; they give a fixed day to delete [4]

## Where they differ from theory

- Deep work suggests four hours a day; they argue **two hours is enough** for a shop owner who also serves customers [7]

## What they do not cover

- **How a team protects deep blocks together**: every method here is for one person

${sources('en')}
` },
}

function storage(lang) {
  const now = Date.UTC(2026, 10, 20)
  const data = {
    settings: { provider: 'groq', keys: {}, lang: lang === 'zh' ? 'zh-TW' : 'en', clubDismissed: true },
    [`creator:${HANDLE}`]: { name: HANDLE, fullName: lang === 'zh' ? '慢慢做工作室' : 'Slow Build Studio', codes, avatar },
    [`kb:${HANDLE}`]: { markdown: KB[lang], updatedAt: now, postCount: POSTS.length },
    [`playbook:${HANDLE}`]: { markdown: PLAYBOOK[lang], updatedAt: now, postCount: POSTS.length },
    [`theory:${HANDLE}`]: { [THEORY[lang].topic]: { ...THEORY[lang], skeleton: [], updatedAt: now } },
    [`checks:${HANDLE}`]: [lang === 'zh' ? '明天早上排出 9 到 11 點的深度時段 [2]' : 'Block 9 to 11 a.m. tomorrow for deep work [2]'],
  }
  POSTS.forEach((p, i) => {
    const [word, topic, point] = p[lang]
    data[`post:${codes[i]}`] = {
      code: codes[i], creator: HANDLE, takenAt: now / 1000 - i * 86400 * 3, caption: topic, collectedAt: now, status: 'done',
      processedAt: now + i, thumb: thumb(i, word), stats: { plays: p.plays, likes: p.likes, comments: Math.round(p.likes / 12) },
      digest: { topic, points: [point, topic], quotes: [topic], terms: [], value: i % 5 === 4 ? '中' : '高', hookType: p.hook },
    }
  })
  return data
}

// Runs before the app's own scripts: fill localStorage, and refuse any request that leaves the dev server.
const seed = (lang) => `(() => {
  if (location.origin !== ${JSON.stringify(`http://localhost:${PORT}`)}) return;
  localStorage.clear();
  for (const [k, v] of Object.entries(${JSON.stringify(storage(lang))})) localStorage.setItem(k, JSON.stringify(v));
  const own = (u) => new URL(String(u instanceof Request ? u.url : u), location.href).origin === location.origin;
  const f = window.fetch;
  window.fetch = (u, ...a) => (own(u) ? f(u, ...a) : Promise.reject(new Error('blocked: ' + u)));
})()`

// ---------- shots ----------

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const main = () => document.querySelector('main');
  const press = (el) => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); el.click(); };
  const open = async () => { press(document.querySelector('header [aria-haspopup=dialog]')); await wait(400);
    [...document.querySelectorAll('[data-radix-popper-content-wrapper] button')].find((b) => b.textContent.includes('${HANDLE}')).click(); await wait(900); };
  const tab = async (i) => { press(document.querySelectorAll('header [role=tab]')[i]); await wait(700); };
  const scrollTo = async (el, offset = 20) => { main().scrollTop += el.getBoundingClientRect().top - main().getBoundingClientRect().top - offset; await wait(400); };
`
const SHOTS = [
  { steps: `await open(); press(document.querySelector('main [aria-haspopup=menu]')); await wait(400);
      document.querySelector('[role=menuitem]').click(); await wait(7400);
      document.getAnimations().forEach((a) => { try { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish() } catch {} });
      await scrollTo(document.querySelector('main .grid-cols-6'), 12);`,
    zh: '看著他的方法，<br>一支一支浮現。', en: "Watch a creator's method<br>appear, video by video." },
  { steps: `await open(); await scrollTo(document.querySelector('main section.tile'), 16);`,
    zh: '他在教什麼、哪種開場最有效，<br>一頁看懂。', en: 'What they teach and which<br>hooks work, on one page.' },
  { steps: `await open(); await scrollTo(document.querySelectorAll('.md-section')[1], 16);`,
    zh: '每個重點都附出處，<br>點了就回到原影片。', en: 'Every point links back<br>to the original video.' },
  { steps: `await open(); await tab(1); await scrollTo(document.querySelector('.md-doc'), 16);`,
    zh: '拆解他的開場和腳本，<br>直接拿來用。', en: 'Break down their hooks<br>and scripts, ready to reuse.' },
  { steps: `await open(); await tab(2); await scrollTo(document.querySelector('.md-doc'), 16);`,
    zh: '把他的說法，<br>對上經典理論。', en: 'Map their advice<br>to proven theories.' },
]

async function until(probe, what) {
  for (let i = 0; i < 80; i++) { try { const v = await probe(); if (v) return v } catch { /* not up yet */ } await sleep(250) }
  throw new Error(`timed out waiting for ${what}`)
}

const profile = mkdtempSync(join(tmpdir(), 'store-shots-'))
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' })
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' })
const kill = (p) => (process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { shell: true }) : p.kill())

// Minimal DevTools protocol client over Node's built-in WebSocket.
let ws, nextId = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++nextId
  pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)))
  ws.send(JSON.stringify({ id, method, params }))
})
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}

async function shot(url, file, { width = 1280, height = 800, scale = 1, ready, steps = '' }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await send('Page.navigate', { url })
  await until(() => evaluate(ready), `${file} to render`)
  if (steps) await evaluate(`(async () => { ${HELPERS} ${steps} })()`).catch(async (e) => {
    const page = await evaluate(`JSON.stringify({ keys: localStorage.length, text: document.body.innerText.slice(0, 300) })`)
    throw new Error(`${e.message}\npage: ${page}`)
  })
  await sleep(800) // thumbnails and fonts settle
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(data, 'base64'))
}

// Promo tiles from ../store-assets/templates/promo.html, using the first highlight as the app shot.
async function promoTiles(lang, dir, steps) {
  const appShot = join(dir, 'promo-shot.png')
  await shot(APP, appShot, { width: 1100, height: 488, scale: 2, steps: `${steps}; document.querySelector('footer[role=status]')?.remove()`, ready: `!!document.querySelector('main button')` })
  for (const [size, width, height] of [['small', 440, 280], ['marquee', 1400, 560]]) {
    const page = new URL(pathToFileURL(join(ROOT, '../store-assets/templates/promo.html')))
    page.search = new URLSearchParams({ p: 'brand-digest', size, lang, shot: pathToFileURL(appShot).href }).toString()
    const file = join(dir, `promo-${size}.png`)
    await shot(page.href, file, { width, height, ready: `[...document.images].every((i) => i.complete && i.naturalWidth)` })
    console.log('saved', file)
  }
}

try {
  await until(() => fetch(APP).then((r) => r.ok), 'the dev server')
  const target = await until(() => fetch(`http://127.0.0.1:${DEBUG}/json/list`).then((r) => r.json()).then((t) => t.find((x) => x.type === 'page')), 'Chrome')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  ws.onmessage = (e) => { const msg = JSON.parse(e.data); pending.get(msg.id)?.(msg); pending.delete(msg.id) }
  await new Promise((r) => (ws.onopen = r))
  await send('Page.enable')

  const inner = join(OUT, 'inner.png')
  for (const lang of ['zh', 'en']) {
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: seed(lang) })
    for (const [i, s] of SHOTS.entries()) {
      await shot(APP, inner, { width: 1100, height: 720, scale: 2, steps: s.steps, ready: `!!document.querySelector('main button')` })
      const frame = new URL(pathToFileURL(join(ROOT, 'scripts/store-frame.html')))
      frame.search = new URLSearchParams({
        title: s[lang],
        orb: pathToFileURL(join(ROOT, 'public/icons/icon-128.png')).href,
        shot: pathToFileURL(inner).href,
      }).toString()
      const dir = join(OUT, lang === 'zh' ? 'tw' : 'en')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `screenshot-${i + 1}.png`)
      await shot(frame.href, file, { ready: `[...document.images].every((i) => i.complete && i.naturalWidth)` })
      console.log('saved', file)
      if (i === 0) await promoTiles(lang, dir, s.steps)
    }
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  rmSync(inner)
} finally {
  ws?.close()
  kill(chrome)
  kill(server)
  await sleep(500)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
