import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PROVIDER_NAMES } from '@/lib/llm'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/store'
import type { Provider, Settings } from '@/types'

const KEY_LINKS: Record<Provider, string> = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    if (open) getSettings().then(setS)
  }, [open])

  const setKey = (p: Provider, v: string) => setS({ ...s, keys: { ...s.keys, [p]: v.trim() } })
  const setModel = (v: string) => setS({ ...s, models: { ...s.models, [s.provider]: v.trim() } })

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
          <Select value={s.provider} onValueChange={(v) => setS({ ...s, provider: v as Provider })}>
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
          <Input id="model" value={s.models[s.provider]} onChange={(e) => setModel(e.target.value)} />
          <p className="text-xs text-muted-foreground">預設：{DEFAULT_SETTINGS.models[s.provider]}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
