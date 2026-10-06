import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PROVIDER_NAMES } from '@/lib/llm'
import { DEFAULT_SETTINGS, MODEL_OPTIONS, getModelStatus, getSettings, saveSettings } from '@/lib/store'
import type { ModelStatus, Provider, Settings } from '@/types'

const KEY_LINKS: Record<Provider, string> = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
}

const CUSTOM = '__custom'
const DAY = 24 * 60 * 60 * 1000

// ponytail: 額度一律當 24 小時後恢復。Groq 是滾動 24 小時，Gemini 是太平洋時間午夜重置（通常更早）
function StatusBadge({ st }: { st?: ModelStatus }) {
  if (st?.state === 'ok') return <Badge variant="outline">可用</Badge>
  if (st?.state === 'missing') return <Badge variant="destructive">無法使用</Badge>
  if (st?.state === 'quota' && Date.now() - st.at < DAY) {
    const back = new Date(st.at + DAY).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return <Badge variant="destructive">額度用完，約 {back} 恢復</Badge>
  }
  return <Badge variant="secondary">還沒用過</Badge>
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<Record<string, ModelStatus>>({})
  const [custom, setCustom] = useState(false)
  useEffect(() => {
    if (!open) return
    getSettings().then(setS)
    getModelStatus().then(setStatus)
    setCustom(false)
  }, [open])

  const setKey = (p: Provider, v: string) => setS({ ...s, keys: { ...s.keys, [p]: v.trim() } })
  const setModel = (v: string) => setS({ ...s, models: { ...s.models, [s.provider]: v.trim() } })

  const model = s.models[s.provider]
  const options = [...new Set([...MODEL_OPTIONS[s.provider], ...(model && !custom ? [model] : [])])]

  async function save() {
    await saveSettings(s)
    toast.success('設定已儲存')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>金鑰只存在這台電腦的瀏覽器裡，只會送給對應的 AI 供應商。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="groq-key">Groq 金鑰（轉錄必填，免費）</Label>
          <Input id="groq-key" type="password" autoComplete="off" placeholder="gsk_…"
            value={s.keys.groq ?? ''} onChange={(e) => setKey('groq', e.target.value)} />
          <p className="text-xs text-muted-foreground">
            到 <a className="underline" href={KEY_LINKS.groq} target="_blank" rel="noreferrer">console.groq.com/keys</a> 免費申請。語音轉文字固定用 Groq Whisper。
          </p>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label>整理重點用的 AI</Label>
          <Select value={s.provider} onValueChange={(v) => (setCustom(false), setS({ ...s, provider: v as Provider }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_NAMES) as Provider[]).map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_NAMES[p]}{p === 'groq' ? '（免費，建議）' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {s.provider !== 'groq' && (
          <div className="grid gap-2">
            <Label htmlFor="llm-key">{PROVIDER_NAMES[s.provider]} 金鑰</Label>
            <Input id="llm-key" type="password" autoComplete="off"
              value={s.keys[s.provider] ?? ''} onChange={(e) => setKey(s.provider, e.target.value)} />
            <p className="text-xs text-muted-foreground">
              <a className="underline" href={KEY_LINKS[s.provider]} target="_blank" rel="noreferrer">到這裡申請金鑰</a>
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="model">模型</Label>
          <Select value={custom ? CUSTOM : model} onValueChange={(v) => (v === CUSTOM ? setCustom(true) : (setCustom(false), setModel(v)))}>
            <SelectTrigger id="model" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m}>
                  {m} <StatusBadge st={status[`${s.provider}:${m}`]} />
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>自訂模型名稱…</SelectItem>
            </SelectContent>
          </Select>
          {custom && (
            <Input aria-label="自訂模型名稱" placeholder="輸入模型名稱" autoFocus
              value={model} onChange={(e) => setModel(e.target.value)} />
          )}
          <p className="text-xs text-muted-foreground">標籤是上次實際使用的結果。預設：{DEFAULT_SETTINGS.models[s.provider]}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
