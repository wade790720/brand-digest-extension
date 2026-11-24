import { ArrowDownToLine, ArrowUpRightFromSquare, ArrowUpFromLine } from '@gravity-ui/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { QuotaRows, StatusBadge } from '@/components/QuotaPanel'
import { ReportProblem } from '@/components/ReportProblem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { browserLang, getLang, resolveLang, setLang, t, type LangSetting } from '@/lib/i18n'
import { CLUB_URL } from '@/lib/links'
import { PROVIDER_NAMES, listModels } from '@/lib/llm'
import { DEFAULT_SETTINGS, MODEL_OPTIONS, exportAll, getModelLists, getModelStatus, getSettings, importAll, saveModelList, saveSettings, type ModelLists } from '@/lib/store'
import { cn, download } from '@/lib/utils'
import type { ModelStatus, Provider, Settings } from '@/types'

const KEY_LINKS: Record<Provider, string> = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
}

const CUSTOM = '__custom'
const form = (x: Settings) => JSON.stringify([x.keys, x.provider, x.models])

function Panel({ title, help, footer, children }: { title: string; help: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <header className="mb-2.5 px-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </header>
      <div className="tile overflow-hidden rounded-xl">
        {children}
        {footer && <footer className="flex items-center gap-2 border-t bg-muted/50 px-4 py-2.5">{footer}</footer>}
      </div>
    </section>
  )
}

function Row({ title, help, field, children }: { title: string; help?: ReactNode; field?: boolean; children: ReactNode }) {
  const Tag = field ? 'label' : 'div'
  return (
    <Tag className="flex items-center gap-6 border-b px-4 py-3 last:border-b-0 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {help && <span className="mt-0.5 block text-xs text-text-secondary">{help}</span>}
      </span>
      <div className={cn('shrink-0', field ? 'sm:w-72' : 'flex flex-wrap justify-end gap-2 max-sm:justify-start')}>{children}</div>
    </Tag>
  )
}

export function SettingsView() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<Record<string, ModelStatus>>({})
  const [custom, setCustom] = useState(false)
  const [lists, setLists] = useState<ModelLists>({})
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    getSettings().then((v) => (setS(v), setSaved(v)))
    getModelStatus().then(setStatus)
  }, [])

  const savedKey = saved.keys[s.provider]
  useEffect(() => {
    const ctrl = new AbortController()
    getModelLists().then(setLists)
    if (savedKey) listModels(s.provider, savedKey, ctrl.signal).then(async (models) => {
      if (!models || ctrl.signal.aborted) return
      await saveModelList(s.provider, models)
      setLists(await getModelLists())
    })
    return () => ctrl.abort()
  }, [s.provider, savedKey])

  const dirty = form(s) !== form(saved)
  const setKey = (p: Provider, v: string) => setS({ ...s, keys: { ...s.keys, [p]: v.trim() } })
  const setModel = (v: string) => setS({ ...s, models: { ...s.models, [s.provider]: v.trim() } })
  const model = s.models[s.provider]
  const live = lists[s.provider]?.models ?? []
  // 建議的模型排前面，其他照名稱；目前選的就算不在清單上也留著
  const options = [...new Set([...MODEL_OPTIONS[s.provider].filter((m) => !live.length || live.includes(m)), ...live, ...(model && !custom ? [model] : [])])]
  const watched = options.filter((m) => MODEL_OPTIONS[s.provider].includes(m) || m === model || status[`${s.provider}:${m}`])

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

  async function changeLang(lang: LangSetting) {
    setS({ ...s, lang })
    setSaved({ ...saved, lang })
    setLang(resolveLang(lang, browserLang()))
    await saveSettings({ ...(await getSettings()), lang })
  }

  async function save() {
    const next = { ...(await getSettings()), keys: s.keys, provider: s.provider, models: s.models }
    await saveSettings(next)
    setS(next)
    setSaved(next)
    setCustom(false)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-8 max-md:px-4">
      <h1 className="sr-only">{t('settings.title')}</h1>

      <Panel title={t('settings.sectionAi')} help={t('settings.desc')} footer={<>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">{dirty ? t('settings.unsaved') : t('settings.allSaved')}</span>
        <Button variant="outline" disabled={!dirty} onClick={() => (setS(saved), setCustom(false))}>{t('common.cancel')}</Button>
        <Button disabled={!dirty} onClick={save}>{t('common.save')}</Button>
      </>}>
        <Row field title={t('settings.groqKey')} help={<>
          {t('settings.groqHelpBefore')}<a className="underline underline-offset-4" href={KEY_LINKS.groq} target="_blank" rel="noreferrer">console.groq.com/keys</a>{t('settings.groqHelpAfter')}
        </>}>
          <Input type="password" autoComplete="off" placeholder="gsk_…" value={s.keys.groq ?? ''} onChange={(e) => setKey('groq', e.target.value)} />
        </Row>
        <Row field title={t('settings.ai')}>
          <Select value={s.provider} onValueChange={(v) => (setCustom(false), setS({ ...s, provider: v as Provider }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_NAMES) as Provider[]).map((p) => (
                <SelectItem key={p} value={p}>{PROVIDER_NAMES[p]}{p === 'groq' ? t('settings.recommended') : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {s.provider !== 'groq' && (
          <Row field title={t('settings.providerKey', { provider: PROVIDER_NAMES[s.provider] })}
            help={<a className="underline underline-offset-4" href={KEY_LINKS[s.provider]} target="_blank" rel="noreferrer">{t('settings.getKey')}</a>}>
            <Input type="password" autoComplete="off" value={s.keys[s.provider] ?? ''} onChange={(e) => setKey(s.provider, e.target.value)} />
          </Row>
        )}
        <Row field title={t('settings.model')} help={t('settings.modelHelp', { model: DEFAULT_SETTINGS.models[s.provider] })}>
          <Select value={custom ? CUSTOM : model} onValueChange={(v) => (v === CUSTOM ? setCustom(true) : (setCustom(false), setModel(v)))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m} className="*:[span]:last:flex-1">
                  {m} <span className="ml-auto in-data-[slot=select-trigger]:hidden"><StatusBadge st={status[`${s.provider}:${m}`]} /></span>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>{t('settings.customModel')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        {custom && (
          <Row field title={t('settings.customModelLabel')}>
            <Input placeholder={t('settings.customModelPlaceholder')} autoFocus value={model} onChange={(e) => setModel(e.target.value)} />
          </Row>
        )}
      </Panel>

      <Panel title={t('quota.title')} help={t('quota.help')}>
        <QuotaRows provider={s.provider} models={watched} status={status} />
      </Panel>

      <Panel title={t('settings.sectionGeneral')} help={t('settings.generalHelp')}>
        <Row field title={t('settings.lang')}>
          <Select value={s.lang ?? 'auto'} onValueChange={(v) => changeLang(v as LangSetting)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('settings.langAuto')}</SelectItem>
              <SelectItem value="zh-TW">{t('settings.langZh')}</SelectItem>
              <SelectItem value="en">{t('settings.langEn')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Panel>

      <Panel title={t('settings.backup')} help={t('settings.backupHelp')}>
        <Row title={t('settings.export')} help={t('settings.exportHelp')}>
          <Button variant="outline" onClick={exportBackup}><ArrowDownToLine />{t('settings.export')}</Button>
        </Row>
        <Row title={t('settings.import')} help={t('settings.importHelp')}>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><ArrowUpFromLine />{t('settings.import')}</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
        </Row>
      </Panel>

      <Panel title={t('settings.sectionSupport')} help={t('settings.supportHelp')}>
        <Row title={t('settings.reportTitle')} help={t('settings.reportHelp')}>
          <div className="flex flex-row-reverse flex-wrap items-center gap-x-4 gap-y-2"><ReportProblem lang={getLang() === 'en' ? 'en' : 'zh'} /></div>
        </Row>
        <Row title={t('settings.clubTitle')} help={t('club.pitch')}>
          <Button variant="outline" asChild data-icon="end">
            <a href={CLUB_URL} target="_blank" rel="noreferrer">{t('club.visit')}<ArrowUpRightFromSquare /></a>
          </Button>
        </Row>
      </Panel>
    </div>
  )
}
