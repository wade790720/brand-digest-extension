// 出處編號 [n]：顯示前統一格式，再變成站內連結 #src-n（點了捲到文末「來源索引」的那一則）。

/** AI 不一定照 [10] 的格式寫出處，常見的還有【n10】、[n10]、【10】、表格裡的 n1、n6。全部統一成 [10]。
 *  前後緊貼英數字或網址符號的不算（例如工具名稱 n8n、貼文網址 /p/DAx_n52/）。 */
export const normalizeCites = (md: string) =>
  md
    .replace(/【\s*n?(\d{1,4})\s*】/g, '[$1]')
    .replace(/\[n(\d{1,4})\]/g, '[$1]')
    .replace(/(?<![\w[\-/.=#?&:])n(\d{1,4})(?![\w\]\-/.])/g, '[$1]')

/** 出處 [6] 變成站內連結 #src-6；後面接 ( 的是一般連結，不動 */
export const linkCites = (md: string) => normalizeCites(md).replace(/\[(\d{1,4})\](?!\()/g, '[\\[$1\\]](#src-$1)')
