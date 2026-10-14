import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { t } from '@/lib/i18n'
import { getTheories, saveTheory } from '@/lib/store'
import { proposeSkeleton, skeletonToText, textToSkeleton } from '@/lib/theory'
import type { Creator, Theory } from '@/types'

// 不填主題：讓 AI 依全部貼文挑理論
export const ALL = '全部內容'

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
          <DialogTitle>{t('theory.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('theory.dialogDesc', { name: creator.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="theory-topic">{t('theory.topicLabel')}</Label>
          <Input id="theory-topic" placeholder={t('theory.topicPlaceholder', { all: t('theory.all') })} value={topic} disabled={busy || text !== null}
            onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text === null && propose(false)} />
        </div>

        {text !== null && (
          <div className="grid gap-2">
            <Label htmlFor="theory-skeleton">{t('theory.skeletonLabel')}{saved && t('theory.skeletonSaved')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('theory.skeletonHelp')}
            </p>
            <textarea id="theory-skeleton" rows={14} value={text} onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
          </div>
        )}

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

        <DialogFooter>
          {text === null ? (
            <Button onClick={() => propose(false)} disabled={busy}>
              {busy ? <><Loader2 className="animate-spin" /> {t('theory.thinkingLong')}</> : t('theory.propose')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => propose(true)} disabled={busy}>
                {busy ? <><Loader2 className="animate-spin" /> {t('theory.thinking')}</> : t('theory.proposeAgain')}
              </Button>
              <Button onClick={start} disabled={busy}>{t('theory.generate')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
