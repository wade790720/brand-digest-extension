import { BookOpen, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { checkGroqKey } from '@/lib/llm'
import { getKnowledgeBase, getSettings, onStoreChange, saveSettings } from '@/lib/store'
import type { Creator } from '@/types'

/** 一個引導步驟：完成打勾、目前這步展開、還沒到的變淡 */
function Step({ n, title, state, children }: { n: number; title: string; state: 'done' | 'now' | 'later'; children?: ReactNode }) {
  return (
    <li className={`flex gap-4 ${state === 'later' ? 'opacity-50' : ''}`}>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        state === 'done' ? 'bg-primary text-primary-foreground' : 'border-2 border-primary text-primary'}`}>
        {state === 'done' ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <p className="font-medium">{title}</p>
        {state === 'now' && children}
      </div>
    </li>
  )
}

/** 沒有選主播時顯示。第一次使用是三步引導：金鑰 → 收集 → 第一份知識庫；三步都完成後只提示從左邊選主播。 */
export function Welcome({ creators, onSelect }: { creators: Creator[]; onSelect: (name: string) => void }) {
  const [hasKey, setHasKey] = useState<boolean>()
  const [hasKb, setHasKb] = useState(false)
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const load = async () => {
      setHasKey(!!(await getSettings()).keys.groq)
      setHasKb((await Promise.all(creators.map((c) => getKnowledgeBase(c.name)))).some(Boolean))
    }
    load()
    return onStoreChange(load)
  }, [creators])

  async function saveKey() {
    const k = key.trim()
    if (!k) return setErr('請先貼上金鑰。')
    setChecking(true)
    setErr('')
    const problem = await checkGroqKey(k)
    setChecking(false)
    if (problem) return setErr(problem)
    const s = await getSettings()
    await saveSettings({ ...s, keys: { ...s.keys, groq: k } })
    setHasKey(true) // 開發預覽沒有 onStoreChange，這裡直接更新
  }

  if (hasKey === undefined) return null // 還在讀設定，避免閃一下引導畫面

  const hasCreator = creators.length > 0
  if (hasKey && hasCreator && hasKb) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BookOpen /></EmptyMedia>
          <EmptyTitle>從左邊選一位主播</EmptyTitle>
          <EmptyDescription>想加新的主播：到他的 IG 主頁往下滑，就會出現在左邊。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const state = (done: boolean, ready: boolean) => (done ? 'done' : ready ? 'now' : 'later') as 'done' | 'now' | 'later'
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">三步做出第一份知識庫</h1>
        <p className="text-muted-foreground">
          滑過主播的 IG 主頁，就把他的短影音整理成知識庫。不對 IG 多發任何請求，資料只存在你的電腦。
        </p>
      </header>

      <Card>
        <CardContent>
          <ol className="space-y-6">
            <Step n={1} title="填 Groq 金鑰（免費，約 2 分鐘）" state={state(hasKey, true)}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  打開 <a className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
                    href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                    console.groq.com/keys <ExternalLink className="size-3" /></a>，用 Google 帳號登入。
                </li>
                <li>按「Create API Key」，名稱隨便填，按建立後複製金鑰。</li>
                <li>貼到下面，按「驗證並儲存」。</li>
              </ol>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" placeholder="gsk_…" aria-label="Groq 金鑰" value={key}
                  onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} />
                <Button onClick={saveKey} disabled={checking}>
                  {checking ? <><Loader2 className="animate-spin" /> 驗證中…</> : '驗證並儲存'}
                </Button>
              </div>
              {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
              <p className="text-xs text-muted-foreground">金鑰只存在這台電腦的瀏覽器裡，只會送給 Groq。轉錄影片用它。</p>
            </Step>

            <Step n={2} title="到 IG 收集一位主播" state={state(hasCreator, hasKey)}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>在 Chrome 打開你想學的主播的<strong className="text-foreground">主頁</strong>（instagram.com/帳號），不是 Reels 分頁。</li>
                <li>右下角會問要不要收集，按「收集」。</li>
                <li>往下滑，看到大約 10 則貼文就夠了。工具列的 brand-digest 圖示會顯示收集了幾則。</li>
                <li>回到這個分頁，主播會自動出現在左邊。</li>
              </ol>
              <Button variant="outline" asChild>
                <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">打開 Instagram <ExternalLink /></a>
              </Button>
            </Step>

            <Step n={3} title="產生第一份知識庫（約 3 分鐘）" state={state(hasKb, hasKey && hasCreator)}>
              <p className="text-sm text-muted-foreground">選一位主播，按「先試 10 則」。看過成果，再決定要不要全部萃取。</p>
              <div className="flex flex-wrap gap-2">
                {creators.map((c) => (
                  <Button key={c.name} variant="outline" onClick={() => onSelect(c.name)}>
                    {c.name}（{c.codes.length} 則）
                  </Button>
                ))}
              </div>
            </Step>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
