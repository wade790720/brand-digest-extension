import { Download, ExternalLink, FileText, History, Loader2, MoreHorizontal, Play, Plus, RefreshCw, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Run } from '@/App'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ALL, TheoryDialog } from '@/components/TheoryDialog'
import { DecodePanel } from '@/components/DecodePanel'
import { KbDashboard } from '@/components/KbDashboard'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteTheory, getChecks, getKnowledgeBase, getPlaybook, getPosts, getSettings, getTheories, onStoreChange, saveChecks, saveSettings } from '@/lib/store'
import { linkCites } from '@/lib/cites'
import { getLang, t, type Key } from '@/lib/i18n'
import { dropTeachLine, taskKey, taskKeys } from '@/lib/tasks'
import { download } from '@/lib/utils'
import type { Creator, KnowledgeBase, Playbook, Post, Theory, TheoryDoc } from '@/types'

const STATUS: Record<Post['status'], { label: Key; variant: 'secondary' | 'default' | 'destructive' }> = {
  new: { label: 'status.new', variant: 'secondary' },
  done: { label: 'status.done', variant: 'default' },
  error: { label: 'status.error', variant: 'destructive' },
}


const TRIAL = 10

const date = (sec: number) => (sec ? new Date(sec * 1000).toLocaleDateString(getLang()) : '')

// react-markdown 預設把 raw HTML 當純文字；這裡只放行 <br>（AI 常在表格裡用它換行）
const rehypeBr = () => (tree: any) => {
  const walk = (node: any) => node.children?.forEach((c: any, i: number) => {
    if (c.type === 'raw' && /^<br\s*\/?>$/i.test(c.value.trim())) node.children[i] = { type: 'element', tagName: 'br', properties: {}, children: [] }
    else walk(c)
  })
  walk(tree)
}


function scrollToSource(article: HTMLElement, n: number) {
  const heading = [...article.querySelectorAll('h2')].find((h) => /來源索引|Sources/.test(h.textContent ?? ''))
  const li = heading?.nextElementSibling?.querySelectorAll(':scope > li')[n - 1] as HTMLElement | undefined
  if (!li) return
  let done = false
  const flash = () => {
    if (done) return
    done = true
    li.classList.remove('source-flash')
    void li.offsetWidth // 連點同一則也要重播動畫
    li.classList.add('source-flash')
    setTimeout(() => li.classList.remove('source-flash'), 1500)
  }
  // 已經在畫面裡就不會捲動，scrollend 不會觸發，靠計時器補
  document.addEventListener('scrollend', flash, { once: true, capture: true })
  setTimeout(flash, 1000)
  li.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

type Tasks = { checked: Set<string>; toggle: (key: string) => void }

const MdContext = createContext<{ tasks?: Tasks; lines: string[] }>({ lines: [] })

// GFM 自帶的勾選框是停用的，換成自己的（見 MdLi）
function MdInput({ node: _node, ...props }: ComponentProps<'input'> & ExtraProps) {
  const { tasks } = use(MdContext)
  return tasks && props.type === 'checkbox' ? null : <input {...props} />
}

function MdLi({ node, className, children, ...props }: ComponentProps<'li'> & ExtraProps) {
  const { tasks, lines } = use(MdContext)
  const key = tasks && className?.includes('task-list-item') ? taskKey(lines[(node?.position?.start.line ?? 0) - 1]) : null
  if (!tasks || !key) return <li className={className} {...props}>{children}</li>
  const on = tasks.checked.has(key)
  return (
    <li className="list-none" {...props}>
      <label className="-ml-6 flex cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-[0.45em] size-4 shrink-0 accent-primary" checked={on} onChange={() => tasks.toggle(key)} />
        <span className={on ? 'text-muted-foreground line-through [&_a]:text-muted-foreground [&_strong]:text-muted-foreground' : ''}>{children}</span>
      </label>
    </li>
  )
}

function MdLink({ href, node: _node, ...props }: ComponentProps<'a'> & ExtraProps) {
  const cite = href?.match(/^#src-(\d+)$/)
  if (!cite) return <a href={href} {...props} target="_blank" rel="noreferrer" />
  return (
    <a href={href} {...props} className="no-underline" title={t('cv.citeTitle', { n: cite[1] })}
      onClick={(e) => (e.preventDefault(), scrollToSource(e.currentTarget.closest('article')!, Number(cite[1])))} />
  )
}

const MD_COMPONENTS: Components = { input: MdInput, li: MdLi, a: MdLink }

function Markdown({ text, tasks }: { text: string; tasks?: Tasks }) {
  const lines = text.split('\n')
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert [:lang(en)_&]:max-w-[70ch]">
      <MdContext value={{ tasks, lines }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeBr]} components={MD_COMPONENTS}>
          {linkCites(text)}
        </ReactMarkdown>
      </MdContext>
    </article>
  )
}

export function CreatorView({ creator, run, stopReason, onRetry, onDelete, onStart, onTheory, onScript, onStop }: {
  creator: Creator
  run: Run | null
  stopReason?: string
  onRetry: () => void
  onDelete: () => void
  onStart: (limit?: number) => void
  onTheory: (topic: string, skeleton: Theory[]) => void
  onScript: () => void
  onStop: () => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [kb, setKb] = useState<KnowledgeBase>()
  const [theories, setTheories] = useState<TheoryDoc[]>([])
  const [playbook, setPlaybook] = useState<Playbook>()
  const [tab, setTab] = useState('kb')
  const [theoryTopic, setTheoryTopic] = useState<string | null>(null)
  const [dialogTopic, setDialogTopic] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [clubDismissed, setClubDismissed] = useState(true)

  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => titleRef.current?.focus(), [])
  const loadId = useRef(0)
  const load = useCallback(async () => {
    const id = ++loadId.current
    const [p, k, th, pb, ch, s] = await Promise.all([getPosts(creator), getKnowledgeBase(creator.name), getTheories(creator.name),
      getPlaybook(creator.name), getChecks(creator.name), getSettings()])
    if (id !== loadId.current) return
    setPosts(p)
    setKb(k)
    setTheories(Object.values(th))
    setPlaybook(pb)
    setChecked(new Set(ch))
    setClubDismissed(!!s.clubDismissed)
  }, [creator])
  useEffect(() => {
    load()
    let t: ReturnType<typeof setTimeout>
    return onStoreChange(() => (clearTimeout(t), (t = setTimeout(load, 300))))
  }, [load])

  const done = posts.filter((p) => p.status === 'done').length
  const failed = posts.filter((p) => p.status === 'error')
  const todo = posts.length - done
  const mine = run?.creator === creator.name
  const busyElsewhere = !!run && !mine
  const trial = !kb && todo > TRIAL

  const actions = kb ? taskKeys(kb.markdown) : []
  const scriptTodo = posts.filter((p) => p.status === 'done' && !p.script && (p.transcript || p.caption)).length
  const startScript = () => (setTab('script'), onScript())
  const actionsDone = actions.filter((k) => checked.has(k)).length
  function toggle(key: string) {
    const next = new Set(checked)
    if (!next.delete(key)) next.add(key)
    setChecked(next)
    saveChecks(creator.name, [...next])
  }

  const byCode = new Map(posts.map((p) => [p.code, p]))
  const runPosts = mine && run!.progress.codes ? run!.progress.codes.flatMap((c) => byCode.get(c) ?? []) : null

  const [replay, setReplay] = useState<{ step: number; speed: 1 | 2 } | null>(null)
  const saved = replay ? posts.filter((p) => p.status === 'done' && p.digest) : []
  const tick = Math.min(800, Math.max(120, 15_000 / (saved.length || 1))) // ponytail: 1× 約 15 秒播完，每則 0.12–0.8 秒
  useEffect(() => {
    if (!replay || replay.step >= saved.length) return
    const id = setTimeout(() => setReplay((r) => r && { ...r, step: r.step + 1 }), tick / replay.speed)
    return () => clearTimeout(id)
  }, [replay, saved.length, tick])
  if (mine && replay) setReplay(null)
  const replayPosts = replay && !mine
    ? saved.map((p, i) => (i < replay.step ? { ...p, processedAt: ((i + 1) * tick) / replay.speed } : { ...p, status: 'new' as const }))
    : null
  const stage = !!runPosts || !!replayPosts
  const replaying = !!replay && replay.step < saved.length

  const sortedTheories = [...theories].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const theory = sortedTheories.find((d) => d.topic === theoryTopic) ?? sortedTheories[0]
  const topicLabel = (topic: string) => (topic === ALL ? t('theory.allLabel') : topic)

  async function dismissClub() {
    setClubDismissed(true)
    await saveSettings({ ...(await getSettings()), clubDismissed: true })
  }

  async function removeTheory(topic: string) {
    if (!confirm(t('cv.deleteTheory', { topic: topicLabel(topic) }))) return
    await deleteTheory(creator.name, topic)
    setTheoryTopic(null)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 ref={titleRef} tabIndex={-1} className="text-2xl font-semibold">{creator.name}</h1>
          <p className="text-sm text-muted-foreground">
            {creator.fullName && `${creator.fullName} · `}
            <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={`https://www.instagram.com/${creator.name}/`} target="_blank" rel="noreferrer">
              instagram.com/{creator.name} <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('app.moreFor', { name: creator.name })}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!!run || done === 0} onSelect={() => setReplay({ step: 0, speed: 1 })}>
                <History /> {t('replay.menu')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete} disabled={mine}>
            <Trash2 /> {t('common.delete')}
          </Button>
        </div>
      </header>

      {stage ? (
        <Card>
          <CardContent className="flex items-center gap-3">
            {(runPosts || replaying) && <Loader2 className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin" />}
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {runPosts ? run!.progress.status : replaying ? t('replay.status', { i: replay!.step + 1, n: saved.length }) : t('replay.done')}
            </p>
            {runPosts ? (
              <Button variant="outline" onClick={onStop}><Square /> {t('cv.stop')}</Button>
            ) : (
              <Button variant="outline" onClick={() => setReplay(null)}><X /> {t('replay.close')}</Button>
            )}
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{t('cv.collected', { n: posts.length })}</Badge>
            <Badge variant="outline">{t('cv.doneCount', { n: done })}</Badge>
            {todo > 0 && <Badge variant="secondary">{t('cv.pending', { n: todo })}</Badge>}
            {actions.length > 0 && (
              <Badge variant={actionsDone === actions.length ? 'default' : 'outline'} title={t('cv.actionsTitle')}>
                {t('cv.actions', { done: actionsDone, total: actions.length })}
              </Badge>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {mine ? (
                <Button variant="outline" onClick={onStop}><Square /> {t('cv.stop')}</Button>
              ) : trial ? (
                <>
                  <Button variant="outline" onClick={() => onStart()} disabled={busyElsewhere}>{t('cv.extractAll', { n: todo })}</Button>
                  <Button onClick={() => onStart(TRIAL)} disabled={busyElsewhere}>
                    <Play /> {t('cv.try', { n: TRIAL })}
                  </Button>
                </>
              ) : (
                <Button onClick={() => onStart()} disabled={busyElsewhere || posts.length === 0}>
                  <Play /> {todo > 0 ? t('cv.extract', { n: todo }) : t('cv.rebuild')}
                </Button>
              )}
            </div>
          </div>
          {busyElsewhere && <p className="text-sm text-muted-foreground">{t('cv.busyElsewhere', { name: run!.creator })}</p>}
          {mine && (
            <div className="space-y-2" aria-live="polite">
              <Progress value={run!.progress.total ? (run!.progress.done / run!.progress.total) * 100 : 0} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {run!.progress.status}
              </p>
              <p className="text-xs text-muted-foreground">{t('cv.keepTab')}</p>
            </div>
          )}
          {!mine && posts.length > 0 && (
            <p className="text-xs text-muted-foreground">{t('cv.collectMore')}</p>
          )}
        </CardContent>
      </Card>
      )}

      {runPosts && (
        <DecodePanel handle={creator.name} posts={runPosts} current={run!.progress.current}
          startedAt={run!.startedAt} note={t('cv.keepTab')} />
      )}
      {replay && replayPosts && (
        <DecodePanel handle={creator.name} posts={replayPosts} current={saved[replay.step]?.code} startedAt={0} live={false}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('replay.label')}</Badge>
            <div role="group" aria-label={t('replay.speed')} className="flex rounded-md border p-0.5">
              {([1, 2] as const).map((s) => (
                <Button key={s} size="xs" variant={replay.speed === s ? 'secondary' : 'ghost'} aria-pressed={replay.speed === s}
                  onClick={() => setReplay({ ...replay, speed: s })}>{s}×</Button>
              ))}
            </div>
            {replay.step >= saved.length && (
              <Button size="sm" variant="ghost" onClick={() => setReplay({ ...replay, step: 0 })}><RotateCcw /> {t('replay.again')}</Button>
            )}
          </div>
        </DecodePanel>
      )}

      {stopReason && !mine && (
        <Alert variant="destructive">
          <AlertTitle>{t('cv.stopped')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{stopReason}</span>
            <Button size="sm" variant="outline" onClick={onRetry} disabled={!!run}><Play /> {t('common.continue')}</Button>
          </AlertDescription>
        </Alert>
      )}

      {failed.length > 0 && !mine && (
        <Alert variant="destructive">
          <AlertTitle>{t('cv.failed', { n: failed.length })}</AlertTitle>
          <AlertDescription>{failed[0].error}</AlertDescription>
        </Alert>
      )}

      {!stage && (
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="kb">{t('cv.tabKb')}</TabsTrigger>
            <TabsTrigger value="script">{t('cv.tabScript')}</TabsTrigger>
            <TabsTrigger value="theory">{theories.length > 1 ? t('cv.tabTheoryN', { n: theories.length }) : t('cv.tabTheory')}</TabsTrigger>
            <TabsTrigger value="posts">{t('cv.tabPosts', { n: posts.length })}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="script" className="space-y-4 pt-4">
          {playbook ? (
            <>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" disabled={!!run} onClick={startScript}>
                  <RefreshCw /> {scriptTodo ? t('cv.scriptUpdate', { n: scriptTodo }) : t('cv.regroup')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => download(t('cv.scriptFile', { name: creator.name }), playbook.markdown)}>
                  <Download /> {t('common.download')}
                </Button>
              </div>
              <Markdown text={playbook.markdown} tasks={{ checked, toggle }} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>{mine ? t('cv.scriptBusy') : t('cv.scriptEmptyTitle')}</EmptyTitle>
                <EmptyDescription>
                  {mine ? t('cv.progressAbove') : done ? t('cv.scriptEmptyDesc', { n: scriptTodo }) : t('cv.scriptNeedsExtract')}
                </EmptyDescription>
              </EmptyHeader>
              {!mine && done > 0 && (
                <Button onClick={startScript} disabled={!!run}><Play /> {t('cv.scriptStart')}</Button>
              )}
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="kb" className="space-y-4 pt-4">
          {kb ? (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => download(t('cv.kbFile', { name: creator.name }), kb.markdown)}>
                  <Download /> {t('common.download')}
                </Button>
              </div>
              <KbDashboard kb={kb} posts={posts} actions={{ done: actionsDone, total: actions.length }}
                clubDismissed={clubDismissed} onDismissClub={dismissClub} />
              <Markdown text={dropTeachLine(kb.markdown)} tasks={{ checked, toggle }} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>{t('cv.kbEmptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('cv.kbEmptyDesc')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="theory" className="space-y-4 pt-4">
          {theory ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={theory.topic} onValueChange={setTheoryTopic}>
                  <SelectTrigger className="w-auto min-w-48" aria-label={t('cv.topicSelect')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sortedTheories.map((d) => (
                      <SelectItem key={d.topic} value={d.topic}>{topicLabel(d.topic)}{!d.markdown && t('cv.unfinished')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" disabled={!!run || done === 0} onClick={() => setDialogTopic('')}>
                  <Plus /> {t('cv.newTopic')}
                </Button>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!!run} onClick={() => setDialogTopic(theory.topic)}>
                    <RefreshCw /> {theory.markdown ? t('cv.regenerate') : t('cv.resume')}
                  </Button>
                  {theory.markdown && (
                    <Button variant="outline" size="sm" onClick={() => download(t('cv.theoryFile', { name: creator.name, topic: topicLabel(theory.topic) }), theory.markdown!)}>
                      <Download /> {t('common.download')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={mine} onClick={() => removeTheory(theory.topic)}>
                    <Trash2 /> {t('common.delete')}
                  </Button>
                </div>
              </div>
              {theory.markdown ? (
                <Markdown text={theory.markdown} />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                    <EmptyTitle>{mine ? t('cv.generating') : t('cv.notFinished')}</EmptyTitle>
                    <EmptyDescription>
                      {mine ? t('cv.progressAbove') : t('cv.resumeHint')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>{t('cv.theoryEmptyTitle')}</EmptyTitle>
                <EmptyDescription>
                  {done
                    ? t('cv.theoryEmptyDesc')
                    : t('cv.theoryNeedsExtract')}
                </EmptyDescription>
              </EmptyHeader>
              {done > 0 && <Button onClick={() => setDialogTopic('')} disabled={!!run}><Play /> {t('cv.theoryStart')}</Button>}
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="posts" className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t('cv.colDate')}</TableHead>
                <TableHead>{t('cv.colContent')}</TableHead>
                <TableHead className="w-20">{t('cv.colStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="align-top text-muted-foreground">{date(p.takenAt)}</TableCell>
                  <TableCell className="max-w-0 whitespace-normal">
                    <a className="line-clamp-2 underline-offset-4 hover:underline"
                      href={`https://www.instagram.com/p/${p.code}/`} target="_blank" rel="noreferrer">
                      {p.digest?.topic ?? (p.caption || t('cv.noCaption'))}
                    </a>
                    {p.error && <p className="mt-1 text-xs text-destructive">{p.error}</p>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS[p.status].variant}>{t(STATUS[p.status].label)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
      )}

      <TheoryDialog creator={creator} open={dialogTopic !== null} initialTopic={dialogTopic ?? ''}
        onOpenChange={(o) => !o && setDialogTopic(null)}
        onStart={(topic, sk) => (setTab('theory'), setTheoryTopic(topic), onTheory(topic, sk))} />
    </div>
  )
}
