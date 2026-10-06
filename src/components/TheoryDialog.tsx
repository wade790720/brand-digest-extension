import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTheories, saveTheory } from '@/lib/store'
import { proposeSkeleton, skeletonToText, textToSkeleton } from '@/lib/theory'
import type { Creator, Theory } from '@/types'

// 不填主題：讓 AI 依全部貼文挑理論
const ALL = '全部內容'

/** 產生理論對位版：①輸入主題 → ②AI 提骨架、使用者確認或修改 → ③交給 onStart 在背景產生 */
export function TheoryDialog({ creator, open, initialTopic, onOpenChange, onStart }: {
  creator: Creator
  open: boolean
  initialTopic: string
  onOpenChange: (o: boolean) => void
  onStart: (topic: string, skeleton: Theory[]) => void
}) {
  const [topic, setTopic] = useState('')
  const [text, setText] = useState<string | null>(null) // null＝還在第一步
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setTopic(initialTopic)
    setText(null)
    setErr('')
  }, [open, initialTopic])

  async function propose(fresh: boolean) {
    const t = topic.trim() || ALL
    setErr('')
    // 這個主題做過，先拿上次確認的骨架，除非要求重提
    const old = fresh ? undefined : (await getTheories(creator.name))[t]
    if (old) {
      setText(skeletonToText(old.skeleton))
      setSaved(true)
      return
    }
    setBusy(true)
    try {
      setText(skeletonToText(await proposeSkeleton(creator, t)))
      setSaved(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    const t = topic.trim() || ALL
    let sk: Theory[]
    try {
      sk = textToSkeleton(text ?? '')
    } catch (e) {
      return setErr(e instanceof Error ? e.message : String(e))
    }
    const old = (await getTheories(creator.name))[t]
    await saveTheory(creator.name, { ...old, topic: t, skeleton: sk })
    onStart(t, sk)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>產生理論對位版</DialogTitle>
          <DialogDescription>
            把 {creator.name} 零碎的經驗對位到既有理論，整理成可以照著做的公式。會另外多一篇，不會覆蓋知識庫。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="theory-topic">想學的主題（可以不填）</Label>
          <Input id="theory-topic" placeholder={`例如：黃金投資時機。不填就用「${ALL}」`} value={topic} disabled={busy || text !== null}
            onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text === null && propose(false)} />
        </div>

        {text !== null && (
          <div className="grid gap-2">
            <Label htmlFor="theory-skeleton">確認理論骨架{saved && '（這是你上次確認過的版本）'}</Label>
            <p className="text-xs text-muted-foreground">
              刪掉不相關的理論，補上漏掉的，再按「開始產生」。格式：一行寫「理論名稱｜出處」，底下每行寫「- 子原則」，理論之間空一行。
            </p>
            <textarea id="theory-skeleton" rows={14} value={text} onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
          </div>
        )}

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

        <DialogFooter>
          {text === null ? (
            <Button onClick={() => propose(false)} disabled={busy}>
              {busy ? <><Loader2 className="animate-spin" /> AI 思考中（約 20 秒）…</> : '請 AI 提出理論骨架'}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => propose(true)} disabled={busy}>
                {busy ? <><Loader2 className="animate-spin" /> AI 思考中…</> : '請 AI 重新提一次'}
              </Button>
              <Button onClick={start} disabled={busy}>開始產生</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
