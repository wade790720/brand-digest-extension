import { Download, ExternalLink, FileText, Loader2, Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Run } from '@/App'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ALL, TheoryDialog } from '@/components/TheoryDialog'
import { DecodePanel } from '@/components/DecodePanel'
import { KbDashboard } from '@/components/KbDashboard'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteTheory, getChecks, getKnowledgeBase, getPlaybook, getPosts, getSettings, getTheories, onStoreChange, saveChecks, saveSettings } from '@/lib/store'
import { linkCites } from '@/lib/cites'
import { getLang, t, type Key } from '@/lib/i18n'
import { taskKey, taskKeys } from '@/lib/tasks'
import { download } from '@/lib/utils'
import type { Creator, KnowledgeBase, Playbook, Post, Theory, TheoryDoc } from '@/types'

const STATUS: Record<Post['status'], { label: Key; variant: 'secondary' | 'default' | 'destructive' }> = {
  new: { label: 'status.new', variant: 'secondary' },
  done: { label: 'status.done', variant: 'default' },
  error: { label: 'status.error', variant: 'destructive' },
}


const TRIAL = 10

const date = (sec: number) => (sec ? new Date(sec * 1000).toLocaleDateString(getLang()) : '')

// AI 常在表格裡用 <br> 換行。只把 <br> 換成真的換行；其他 HTML 照舊當純文字顯示，不執行 AI 產生的 HTML
const rehypeBr = () => (tree: any) => {
  const walk = (node: any) => node.children?.forEach((c: any, i: number) => {
    if (c.type === 'raw' && /^<br\s*\/?>$/i.test(c.value.trim())) node.children[i] = { type: 'element', tagName: 'br', properties: {}, children: [] }
    else walk(c)
  })
  walk(tree)
}


/** 捲到文末「來源索引」的第 n 項，停下後邊框亮一下（樣式在 index.css 的 .source-flash） */
function scrollToSource(article: HTMLElement, n: number) {
  const heading = [...article.querySelectorAll('h2')].find((h) => /來源索引|Sources/.test(h.textContent ?? '')) // 兩種語言產生的都要認得
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
  // 捲動停下才亮，不然動畫在捲動途中就播完了。已經在畫面裡不會捲動，就靠計時器
  document.addEventListener('scrollend', flash, { once: true, capture: true })
  setTimeout(flash, 1000)
  li.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** tasks：可行動清單可以勾選。checked 是勾掉的項目原文 */
function Markdown({ text, tasks }: { text: string; tasks?: { checked: Set<string>; toggle: (key: string) => void } }) {
  const lines = text.split('\n') // linkCites 不改行數，所以能用行號對回原文
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeBr]}
        components={{
          // GFM 自帶的勾選框是停用的，換成自己的（見下面的 li）
          input: ({ node: _node, ...props }) => (tasks && props.type === 'checkbox' ? null : <input {...props} />),
          li: ({ node, className, children, ...props }) => {
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
          },
          a: ({ href, node: _node, ...props }) => {
            const cite = href?.match(/^#src-(\d+)$/)
            if (!cite) return <a href={href} {...props} target="_blank" rel="noreferrer" />
            return (
              <a href={href} {...props} className="no-underline" title={t('cv.citeTitle', { n: cite[1] })}
                onClick={(e) => (e.preventDefault(), scrollToSource(e.currentTarget.closest('article')!, Number(cite[1])))} />
            )
          },
        }}>
        {linkCites(text)}
      </ReactMarkdown>
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
  const [tab, setTab] = useState('kb') // kb、script、theory、posts
  const [theoryTopic, setTheoryTopic] = useState<string | null>(null) // 理論對位分頁裡選中的主題；null＝最新的一篇
  const [dialogTopic, setDialogTopic] = useState<string | null>(null) // null＝對話框關著
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [clubDismissed, setClubDismissed] = useState(true) // 讀到設定前先不顯示，免得閃一下

  const load = useCallback(async () => {
    setPosts(await getPosts(creator))
    setKb(await getKnowledgeBase(creator.name))
    setTheories(Object.values(await getTheories(creator.name)))
    setPlaybook(await getPlaybook(creator.name))
    setChecked(new Set(await getChecks(creator.name)))
    setClubDismissed(!!(await getSettings()).clubDismissed)
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
  // 還沒有知識庫又有很多則：建議先試幾則，幾分鐘內看到成果，再決定要不要全部做
  const trial = !kb && todo > TRIAL

  const actions = kb ? taskKeys(kb.markdown) : []
  // 萃取完成、還沒拆解腳本的貼文（拆解用萃取時存下的逐字稿，不用重新轉錄）
  const scriptTodo = posts.filter((p) => p.status === 'done' && !p.script && (p.transcript || p.caption)).length
  const startScript = () => (setTab('script'), onScript())
  const actionsDone = actions.filter((k) => checked.has(k)).length
  function toggle(key: string) {
    const next = new Set(checked)
    if (!next.delete(key)) next.add(key)
    setChecked(next)
    saveChecks(creator.name, [...next])
  }

  // 萃取中：這次要處理的貼文，給拆解畫面（理論對位、腳本拆解沒有 codes，照舊只顯示進度）
  const byCode = new Map(posts.map((p) => [p.code, p]))
  const runPosts = mine && run!.progress.codes ? run!.progress.codes.flatMap((c) => byCode.get(c) ?? []) : null

  // 理論對位：一個主題一篇，全部收在同一個分頁裡用選單切換，分頁列不會因為主題變多而變長
  const sortedTheories = [...theories].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const theory = sortedTheories.find((d) => d.topic === theoryTopic) ?? sortedTheories[0]
  const topicLabel = (topic: string) => (topic === ALL ? t('theory.allLabel') : topic)

  // 知識庫上方的俱樂部提示：按關閉就存起來，之後所有主播都不再出現
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
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{creator.name}</h1>
          <p className="text-sm text-muted-foreground">
            {creator.fullName && `${creator.fullName} · `}
            <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={`https://www.instagram.com/${creator.name}/`} target="_blank" rel="noreferrer">
              instagram.com/{creator.name} <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        {/* 處理中不能刪：會刪到正在寫入的資料 */}
        <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={onDelete} disabled={mine}>
          <Trash2 /> {t('common.delete')}
        </Button>
      </header>

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
          {runPosts && <p className="text-xs text-muted-foreground">{t('cv.keepTab')}</p>}
          {mine && !runPosts && (
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

      {runPosts && (
        <DecodePanel handle={creator.name} posts={runPosts} current={run!.progress.current}
          startedAt={run!.startedAt} status={run!.progress.status} />
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
              <Markdown text={kb.markdown} tasks={{ checked, toggle }} />
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

      <TheoryDialog creator={creator} open={dialogTopic !== null} initialTopic={dialogTopic ?? ''}
        onOpenChange={(o) => !o && setDialogTopic(null)}
        onStart={(topic, sk) => (setTab('theory'), setTheoryTopic(topic), onTheory(topic, sk))} />
    </div>
  )
}
