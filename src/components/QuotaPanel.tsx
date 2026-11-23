import { useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { getLang, t } from '@/lib/i18n'
import { PROVIDER_NAMES, WHISPER, minuteUsage } from '@/lib/llm'
import type { ModelStatus, Provider } from '@/types'

const DAY = 24 * 60 * 60 * 1000

// ponytail: 額度一律當 24 小時後恢復。Groq 是滾動 24 小時，Gemini 是太平洋時間午夜重置（通常更早）
export function StatusBadge({ st }: { st?: ModelStatus }) {
  if (st?.state === 'ok') return <Badge variant="outline">{t('settings.statusOk')}</Badge>
  if (st?.state === 'missing') return <Badge variant="destructive">{t('settings.statusMissing')}</Badge>
  if (st?.state === 'quota' && Date.now() - st.at < DAY) {
    const back = new Date(st.at + DAY).toLocaleString(getLang(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return <Badge variant="destructive">{t('settings.statusQuota', { time: back })}</Badge>
  }
  return <Badge variant="secondary">{t('settings.statusNew')}</Badge>
}

function ModelList({ title, prefix, models, status }: { title: string; prefix: string; models: string[]; status: Record<string, ModelStatus> }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="divide-y rounded-lg border text-xs">
        {models.map((m) => (
          <li key={m} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <span className="min-w-0 truncate" title={m}>{m}</span>
            <StatusBadge st={status[`${prefix}:${m}`]} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function QuotaPanel({ provider, models, status }: { provider: Provider; models: string[]; status: Record<string, ModelStatus> }) {
  const [now, setNow] = useState(Date.now)
  const labelId = useId()
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const usage = minuteUsage(provider, now)
  const name = PROVIDER_NAMES[provider]
  const num = new Intl.NumberFormat(getLang())

  return (
    <div className="grid gap-3">
      <Label>{t('quota.title')}</Label>
      {usage && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span id={labelId} className="text-muted-foreground">{t('quota.minute', { name })}</span>
            <span className="shrink-0 tabular-nums">{num.format(usage.used)} / {num.format(usage.cap)}</span>
          </div>
          <Progress value={Math.round((usage.used / usage.cap) * 100)} aria-labelledby={labelId} />
          <p className="text-xs text-muted-foreground tabular-nums">
            {usage.freesInMs ? t('quota.frees', { s: Math.ceil(usage.freesInMs / 1000) }) : t('quota.idle')}
          </p>
        </div>
      )}
      <ModelList title={t('quota.extract', { name })} prefix={provider} models={models} status={status} />
      <ModelList title={t('quota.transcribe')} prefix="whisper" models={WHISPER} status={status} />
    </div>
  )
}
