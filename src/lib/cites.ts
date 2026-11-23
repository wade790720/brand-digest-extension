export const normalizeCites = (md: string) =>
  md
    .replace(/【\s*n?(\d{1,4})\s*】/g, '[$1]')
    .replace(/\[n(\d{1,4})\]/g, '[$1]')
    .replace(/(?<![\w[\-/.=#?&:])n(\d{1,4})(?![\w\]\-/.])/g, '[$1]')

export const linkCites = (md: string) => normalizeCites(md).replace(/\[(\d{1,4})\](?!\()/g, '[\\[$1\\]](#src-$1)')
