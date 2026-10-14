// 提示詞移植自 brand-digest（Python 版）的 pipeline/digest.py 與 pipeline/aggregate.py。
// JSON 欄位名用英文（程式好處理）。說明文字維持中文，輸出語言和章節標題跟著介面語言（lang）。
import { t, type Lang } from '@/lib/i18n'

export const digestSystem = (lang: Lang) => `你是擅長從社群內容萃取乾貨的知識整理專家。
你的任務：濾掉問候、業配、閒聊、情緒鋪陳，只留下可學習、可應用的知識點。
規則：
- ${t('ai.lang', {}, lang)}
- 只回傳 JSON，不要任何其他文字或 markdown 圍欄。`

export const digestUser = (caption: string, transcript: string) => `以下是一位創作者的一則內容，請萃取乾貨，回傳這個結構的 JSON：

{
  "topic": "一句話點出這篇在講什麼",
  "points": ["具體可應用的知識點或步驟；沒有實質乾貨就空陣列"],
  "quotes": ["值得記下的原話或觀點"],
  "terms": ["提到的工具、書、人名、專有名詞"],
  "value": "高 / 中 / 低（純引流或無實質內容給低）"
}
value 欄位固定填「高」「中」「低」其中一個字，不要翻譯（程式用它篩選）。

【貼文文字】
${caption.trim() || '（無）'}

【影片字幕】
${transcript.trim() || '（無）'}`

export const aggregateSystem = (lang: Lang) => `你是知識體系建構專家。你會拿到一位創作者多篇內容的乾貨萃取結果（JSON 陣列，每則有 n 編號）。
你的任務不是把每篇摘要疊起來，而是做「概念整合與交叉比對」：
1. 把不同篇章裡『相同或相似的概念』合併成一條，整合各篇的說法、補充彼此的細節，給出最完整、最好的版本。
2. 當多篇講到同一主題時，交叉比對它們的異同：一致處歸納成通則，衝突或不同角度處點出來並說明適用情境。
3. 濾掉重複與冗詞，最終呈現的是『去重、互補、經過提煉』的知識，而不是原文堆疊。
${t('ai.lang', {}, lang)}輸出 Markdown。`

const sections = (lang: Lang) => {
  const h = (k: Parameters<typeof t>[0]) => t(k, {}, lang)
  return `章節固定為（用 ## 標題，標題文字照抄）：

## ${h('kb.hTeach')}
## ${h('kb.hMethod')}
## ${h('kb.hClusters')}
## ${h('kb.hActions')}

整合與比對要求：
- 「${h('kb.hMethod')}」：把散落各篇、講的是同一件事的知識點『合併成一條』，整合各篇細節給出最完整版本；
  不是逐篇羅列。若多篇對同一做法有不同說法，交叉比對後給出你判斷最好的做法，並註明差異。
- 「${h('kb.hClusters')}」：把相同/相似概念的篇章分到同一群，每群一個小標題，群內做交叉整合（共同點寫成通則、
  差異點各自說明適用情境），而不是把每篇重點並列。
- 「${h('kb.hActions')}」：整合後去重的具體行動，用勾選框格式（- [ ]）。
- 只呈現梳理後的重點，不要獨立列金句、不要列工具清單。
- 每個知識點後標 [編號] 指出它整合自哪幾則（可多個），例如「早上做要事 [3][7]」。編號只能用資料裡出現過的。
- 直接輸出 Markdown，不要包程式碼圍欄。`
}

export const aggregateUser = (creator: string, count: number, digestsJson: string, lang: Lang) =>
  `以下是「${creator}」共 ${count} 篇內容的萃取結果，請做概念整合與交叉比對後，
歸納成一份『經過脈絡梳理的重點知識庫』Markdown，${sections(lang)}

【各篇萃取結果】
${digestsJson}`

/** 內容太多、要分批整理時，把幾份分批結果合成一份。 */
export const mergeUser = (creator: string, parts: string[], lang: Lang) =>
  `以下是「${creator}」的知識庫，因為內容太多分成 ${parts.length} 批整理。請把它們合併成一份，
相同概念合併成一條、保留所有 [編號]，${sections(lang)}

${parts.map((p, i) => `【第 ${i + 1} 批】\n${p}`).join('\n\n')}`
