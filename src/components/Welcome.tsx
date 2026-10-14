import { BookOpen, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'
import { checkGroqKey } from '@/lib/llm'
import { getKnowledgeBase, getSettings, onStoreChange, saveSettings } from '@/lib/store'
import type { Creator } from '@/types'

/** 一個引導步驟：完成打勾、目前這步展開、還沒到的變淡 */
function Step({ n, title, state, children }: { n: number; title: string; state: 'done' | 'now' | 'later'; children?: ReactNode }) {
  return (
    <li className={`flex gap-4 ${state === 'later' ? 'opacity-50' : ''}`}>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        state === 'done' ? 'bg-primary text-primary-foreground' : 'border-2 border-primary text-primary-text'}`}>
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
    if (!k) return setErr(t('welcome.s1.empty'))
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
          <EmptyTitle>{t('welcome.pickTitle')}</EmptyTitle>
          <EmptyDescription>{t('welcome.pickDesc')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const state = (done: boolean, ready: boolean) => (done ? 'done' : ready ? 'now' : 'later') as 'done' | 'now' | 'later'
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('welcome.title')}</h1>
        <p className="text-muted-foreground">
          {t('welcome.lead')}
        </p>
      </header>

      <Card>
        <CardContent>
          <ol className="space-y-6">
            <Step n={1} title={t('welcome.s1.title')} state={state(hasKey, true)}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  {t('welcome.s1.openBefore')}<a className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
                    href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                    console.groq.com/keys <ExternalLink className="size-3" /></a>{t('welcome.s1.openAfter')}
                </li>
                <li>{t('welcome.s1.create')}</li>
                <li>{t('welcome.s1.paste')}</li>
              </ol>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" placeholder="gsk_…" aria-label={t('welcome.s1.keyLabel')} value={key}
                  onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} />
                <Button onClick={saveKey} disabled={checking}>
                  {checking ? <><Loader2 className="animate-spin" /> {t('welcome.s1.checking')}</> : t('welcome.s1.save')}
                </Button>
              </div>
              {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
              <p className="text-xs text-muted-foreground">{t('welcome.s1.note')}</p>
            </Step>

            <Step n={2} title={t('welcome.s2.title')} state={state(hasCreator, hasKey)}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t('welcome.s2.profileBefore')}<strong className="text-foreground">{t('welcome.s2.profile')}</strong>{t('welcome.s2.profileAfter')}</li>
                <li>{t('welcome.s2.ask')}</li>
                <li>{t('welcome.s2.scroll', { app: t('app.name') })}</li>
                <li>{t('welcome.s2.back')}</li>
              </ol>
              <Button variant="outline" asChild>
                <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">{t('welcome.s2.open')} <ExternalLink /></a>
              </Button>
            </Step>

            <Step n={3} title={t('welcome.s3.title')} state={state(hasKb, hasKey && hasCreator)}>
              <p className="text-sm text-muted-foreground">{t('welcome.s3.desc')}</p>
              <div className="flex flex-wrap gap-2">
                {creators.map((c) => (
                  <Button key={c.name} variant="outline" onClick={() => onSelect(c.name)}>
                    {c.name} · {t('common.posts', { n: c.codes.length })}
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
