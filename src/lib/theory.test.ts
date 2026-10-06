import { describe, expect, it } from 'vitest'
import { cleanMd, fit, saturation, saturationNote, skeletonToText, textToSkeleton } from './theory'

describe('cleanMd', () => {
  it('把碎片id 改回則編號', () => {
    expect(cleanMd('做法 [2-2][10-3]，見 6‑4：x')).toBe('做法 [2][10]，見 [6]：x')
  })
  it('不動一般的連字號數字', () => {
    expect(cleanMd("Mehrabian's 7-38-55 Rule")).toBe("Mehrabian's 7-38-55 Rule")
  })
  it('理論小節裡的子標題降成 ####', () => {
    expect(cleanMd('### 理論\n## **互惠**\n- a', true)).toBe('### 理論\n#### 互惠\n- a')
  })
  it('剝掉程式碼圍欄', () => {
    expect(cleanMd('```markdown\n## 標題\n```')).toBe('## 標題')
  })
})

describe('理論骨架文字格式', () => {
  const sk = textToSkeleton('Cialdini 說服原則｜Robert Cialdini\n- 互惠\n- 稀缺\n\n社會認同\n')
  it('依順序編 id', () => {
    expect(sk.map((t) => t.id)).toEqual(['T1', 'T2'])
    expect(sk[0].source).toBe('Robert Cialdini')
    expect(sk[0].principles.map((p) => p.id)).toEqual(['T1.1', 'T1.2'])
  })
  it('沒列子原則：用理論本身', () => {
    expect(sk[1].principles).toEqual([{ id: 'T2.1', name: '社會認同' }])
  })
  it('文字格式來回不失真', () => {
    expect(textToSkeleton(skeletonToText(sk))).toEqual(sk)
  })
  it('空的骨架要報錯', () => {
    expect(() => textToSkeleton('  \n')).toThrow('理論骨架是空的')
  })
})

describe('飽和度', () => {
  // 第 1 則最新、第 3 則最舊；最舊的兩則就講完全部觀念
  const m = { mapped: { 'T1.1': ['3-1', '1-1'], 'T1.2': ['2-1'] }, unique: [{ ids: ['3-2'], point: 'x' }], conflicts: [] }
  it('依發文時間累計觀念數', () => {
    expect(saturation([300, 200, 100], m)).toEqual([2, 3, 3])
  })
  it('說明前幾則涵蓋 80%', () => {
    expect(saturationNote([2, 3, 3])).toBe('_飽和度：依發文時間，前 2 則（66%）就涵蓋了 80% 的觀念；全部 3 則共 3 個觀念。_')
    expect(saturationNote([0, 0])).toBe('')
  })
})

it('fit 超過上限就截掉並註明', () => {
  expect(fit(['aaa', 'bbb', 'ccc'], 8)).toBe('aaa\nbbb\n（還有 1 項，篇幅限制略過）')
  expect(fit(['a'], 8)).toBe('a')
})
