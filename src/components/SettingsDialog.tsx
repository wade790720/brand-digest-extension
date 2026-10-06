import { Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { DEFAULT_SETTINGS, MODEL_OPTIONS, exportAll, getModelStatus, getSettings, importAll, saveSettings } from '@/lib/store'
import { download } from '@/lib/utils'
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

  const fileRef = useRef<HTMLInputElement>(null)

  async function exportBackup() {
    const day = new Date().toLocaleDateString('sv') // YYYY-MM-DD
    download(`brand-digest-備份-${day}.json`, JSON.stringify(await exportAll()), 'application/json')
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const n = await importAll(JSON.parse(await file.text()))
      toast.success(`已匯入 ${n} 位博主的資料`)
    } catch (e) {
      toast.error(e instanceof SyntaxError ? '檔案格式不對，請選匯出的 .json 備份檔。' : e instanceof Error ? e.message : String(e))
    } finally {
      if (fileRef.current) fileRef.current.value = '' // 同一個檔案可以再選一次
    }
  }

  async function save() {
    await saveSettings(s)
    toast.success('設定已儲存')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
                // 選項文字撐滿整列，標籤才能靠右
                <SelectItem key={m} value={m} className="*:[span]:last:flex-1">
                  {m} <span className="ml-auto"><StatusBadge st={status[`${s.provider}:${m}`]} /></span>
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

        <Separator />

        <div className="grid gap-2">
          <Label>資料備份</Label>
          <p className="text-xs text-muted-foreground">
            在 chrome://extensions 移除擴充功能，會一併刪掉所有資料。移除前先匯出備份，重新安裝後再匯入。備份不含金鑰。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportBackup}><Download /> 匯出備份</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> 匯入備份</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden
              onChange={(e) => importBackup(e.target.files?.[0])} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
