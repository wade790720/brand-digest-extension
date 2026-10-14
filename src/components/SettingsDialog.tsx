import { Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReportProblem } from '@/components/ReportProblem'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { browserLang, getLang, resolveLang, setLang, t, type LangSetting } from '@/lib/i18n'
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
  if (st?.state === 'ok') return <Badge variant="outline">{t('settings.statusOk')}</Badge>
  if (st?.state === 'missing') return <Badge variant="destructive">{t('settings.statusMissing')}</Badge>
  if (st?.state === 'quota' && Date.now() - st.at < DAY) {
    const back = new Date(st.at + DAY).toLocaleString(getLang(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return <Badge variant="destructive">{t('settings.statusQuota', { time: back })}</Badge>
  }
  return <Badge variant="secondary">{t('settings.statusNew')}</Badge>
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
    download(t('settings.backupFile', { day }), JSON.stringify(await exportAll()), 'application/json')
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const n = await importAll(JSON.parse(await file.text()))
      toast.success(t('settings.imported', { n }))
    } catch (e) {
      toast.error(e instanceof SyntaxError ? t('settings.badFile') : e instanceof Error ? e.message : String(e))
    } finally {
      if (fileRef.current) fileRef.current.value = '' // 同一個檔案可以再選一次
    }
  }

  // 語言一選就生效並存起來，不用等按「儲存」：使用者要立刻看到換好的畫面
  async function changeLang(lang: LangSetting) {
    setS({ ...s, lang })
    setLang(resolveLang(lang, browserLang()))
    await saveSettings({ ...(await getSettings()), lang })
  }

  async function save() {
    await saveSettings(s)
    toast.success(t('settings.saved'))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.desc')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="lang">{t('settings.lang')}</Label>
          <Select value={s.lang ?? 'auto'} onValueChange={(v) => changeLang(v as LangSetting)}>
            <SelectTrigger id="lang" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('settings.langAuto')}</SelectItem>
              <SelectItem value="zh-TW">{t('settings.langZh')}</SelectItem>
              <SelectItem value="en">{t('settings.langEn')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label htmlFor="groq-key">{t('settings.groqKey')}</Label>
          <Input id="groq-key" type="password" autoComplete="off" placeholder="gsk_…"
            value={s.keys.groq ?? ''} onChange={(e) => setKey('groq', e.target.value)} />
          <p className="text-xs text-muted-foreground">
            {t('settings.groqHelpBefore')}<a className="underline" href={KEY_LINKS.groq} target="_blank" rel="noreferrer">console.groq.com/keys</a>{t('settings.groqHelpAfter')}
          </p>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label>{t('settings.ai')}</Label>
          <Select value={s.provider} onValueChange={(v) => (setCustom(false), setS({ ...s, provider: v as Provider }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_NAMES) as Provider[]).map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_NAMES[p]}{p === 'groq' ? t('settings.recommended') : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {s.provider !== 'groq' && (
          <div className="grid gap-2">
            <Label htmlFor="llm-key">{t('settings.providerKey', { provider: PROVIDER_NAMES[s.provider] })}</Label>
            <Input id="llm-key" type="password" autoComplete="off"
              value={s.keys[s.provider] ?? ''} onChange={(e) => setKey(s.provider, e.target.value)} />
            <p className="text-xs text-muted-foreground">
              <a className="underline" href={KEY_LINKS[s.provider]} target="_blank" rel="noreferrer">{t('settings.getKey')}</a>
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="model">{t('settings.model')}</Label>
          <Select value={custom ? CUSTOM : model} onValueChange={(v) => (v === CUSTOM ? setCustom(true) : (setCustom(false), setModel(v)))}>
            <SelectTrigger id="model" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                // 選項文字撐滿整列，標籤才能靠右
                <SelectItem key={m} value={m} className="*:[span]:last:flex-1">
                  {m} <span className="ml-auto"><StatusBadge st={status[`${s.provider}:${m}`]} /></span>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>{t('settings.customModel')}</SelectItem>
            </SelectContent>
          </Select>
          {custom && (
            <Input aria-label={t('settings.customModelLabel')} placeholder={t('settings.customModelPlaceholder')} autoFocus
              value={model} onChange={(e) => setModel(e.target.value)} />
          )}
          <p className="text-xs text-muted-foreground">{t('settings.modelHelp', { model: DEFAULT_SETTINGS.models[s.provider] })}</p>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label>{t('settings.backup')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('settings.backupHelp')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportBackup}><Download /> {t('settings.export')}</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> {t('settings.import')}</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden
              onChange={(e) => importBackup(e.target.files?.[0])} />
            <ReportProblem />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={save}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
