import { Download, ExternalLink, FileText, Loader2, Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Run } from '@/App'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TheoryDialog } from '@/components/TheoryDialog'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteTheory, getChecks, getKnowledgeBase, getPosts, getTheories, onStoreChange, saveChecks } from '@/lib/store'
import { taskKey, taskKeys } from '@/lib/tasks'
import { download } from '@/lib/utils'
import type { Creator, KnowledgeBase, Post, Theory, TheoryDoc } from '@/types'

const STATUS: Record<Post['status'], { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  new: { label: '待處理', variant: 'secondary' },
  done: { label: '完成', variant: 'default' },
  error: { label: '失敗', variant: 'destructive' },
}

const VALUE: Record<'高' | '中' | '低', 'default' | 'secondary' | 'outline'> = { 高: 'default', 中: 'secondary', 低: 'outline' }

const TRIAL = 10

const date = (sec: number) => (sec ? new Date(sec * 1000).toLocaleDateString('zh-TW') : '')

// AI 常在表格裡用 <br> 換行。只把 <br> 換成真的換行；其他 HTML 照舊當純文字顯示，不執行 AI 產生的 HTML
const rehypeBr = () => (tree: any) => {
  const walk = (node: any) => node.children?.forEach((c: any, i: number) => {
    if (c.type === 'raw' && /^<br\s*\/?>$/i.test(c.value.trim())) node.children[i] = { type: 'element', tagName: 'br', properties: {}, children: [] }
    else walk(c)
  })
  walk(tree)
}

// 出處 [6] 變成站內連結 #src-6；後面接 ( 的是一般連結，不動
const linkCites = (md: string) => md.replace(/\[(\d{1,4})\](?!\()/g, '[\\[$1\\]](#src-$1)')

/** 捲到文末「來源索引」的第 n 項，停下後邊框亮一下（樣式在 index.css 的 .source-flash） */
function scrollToSource(article: HTMLElement, n: number) {
  const heading = [...article.querySelectorAll('h2')].find((h) => h.textContent?.includes('來源索引'))
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
              <a href={href} {...props} className="no-underline" title={`看第 ${cite[1]} 則的來源`}
                onClick={(e) => (e.preventDefault(), scrollToSource(e.currentTarget.closest('article')!, Number(cite[1])))} />
            )
          },
        }}>
        {linkCites(text)}
      </ReactMarkdown>
    </article>
  )
}

export function CreatorView({ creator, run, stopReason, onRetry, onStart, onTheory, onStop }: {
  creator: Creator
  run: Run | null
  stopReason?: string
  onRetry: () => void
  onStart: (limit?: number) => void
  onTheory: (topic: string, skeleton: Theory[]) => void
  onStop: () => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [kb, setKb] = useState<KnowledgeBase>()
  const [theories, setTheories] = useState<TheoryDoc[]>([])
  const [tab, setTab] = useState('kb') // kb、posts，或 theory:<主題>
  const [dialogTopic, setDialogTopic] = useState<string | null>(null) // null＝對話框關著
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setPosts(await getPosts(creator))
    setKb(await getKnowledgeBase(creator.name))
    setTheories(Object.values(await getTheories(creator.name)))
    setChecked(new Set(await getChecks(creator.name)))
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
  const actionsDone = actions.filter((k) => checked.has(k)).length
  function toggle(key: string) {
    const next = new Set(checked)
    if (!next.delete(key)) next.add(key)
    setChecked(next)
    saveChecks(creator.name, [...next])
  }

  // 這次萃取新完成的貼文，翻成精華卡（新的在前）
  const fresh = mine ? posts.filter((p) => p.digest && (p.processedAt ?? 0) >= run!.startedAt)
    .sort((a, b) => b.processedAt! - a.processedAt!) : []
  const tally = (v: string) => fresh.filter((p) => p.digest!.value === v).length

  async function removeTheory(topic: string) {
    if (!confirm(`刪除「理論對位：${topic}」？刪掉後要重新產生。`)) return
    await deleteTheory(creator.name, topic)
    setTab('kb')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">{creator.name}</h1>
        <p className="text-sm text-muted-foreground">
          {creator.fullName && `${creator.fullName} · `}
          <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            href={`https://www.instagram.com/${creator.name}/`} target="_blank" rel="noreferrer">
            instagram.com/{creator.name} <ExternalLink className="size-3" />
          </a>
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">已收集 {posts.length} 則</Badge>
            <Badge variant="outline">已完成 {done}</Badge>
            {todo > 0 && <Badge variant="secondary">待處理 {todo}</Badge>}
            {actions.length > 0 && (
              <Badge variant={actionsDone === actions.length ? 'default' : 'outline'} title="知識庫「可行動清單」完成幾項">
                行動 {actionsDone}/{actions.length}
              </Badge>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {mine ? (
                <Button variant="outline" onClick={onStop}><Square /> 停止</Button>
              ) : trial ? (
                <>
                  <Button variant="outline" onClick={() => onStart()} disabled={busyElsewhere}>全部萃取（{todo} 則）</Button>
                  <Button onClick={() => onStart(TRIAL)} disabled={busyElsewhere}>
                    <Play /> 先試 {TRIAL} 則（約 3 分鐘）
                  </Button>
                </>
              ) : (
                <Button onClick={() => onStart()} disabled={busyElsewhere || posts.length === 0}>
                  <Play /> {todo > 0 ? `開始萃取（${todo} 則）` : '重新整合知識庫'}
                </Button>
              )}
            </div>
          </div>
          {busyElsewhere && <p className="text-sm text-muted-foreground">正在處理 {run!.creator}，完成後才能開始這位。</p>}
          {mine && (
            <div className="space-y-2" aria-live="polite">
              <Progress value={run!.progress.total ? (run!.progress.done / run!.progress.total) * 100 : 0} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {run!.progress.status}
              </p>
              <p className="text-xs text-muted-foreground">處理中請不要關閉這個分頁。可以切到別的分頁。</p>
            </div>
          )}
          {!mine && posts.length > 0 && (
            <p className="text-xs text-muted-foreground">想收集更多：回到這位主播的 IG 主頁，在右下角按「收集」，再往下滑。</p>
          )}
        </CardContent>
      </Card>

      {fresh.length > 0 && (
        <section className="space-y-3" aria-label="這次萃取出的精華">
          <p className="text-sm text-muted-foreground">
            已翻出 {fresh.length} 張精華卡：含金量高 {tally('高')}、中 {tally('中')}、低 {tally('低')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fresh.slice(0, 6).map((p) => (
              <div key={p.code} className={`essence-card space-y-2 rounded-xl border bg-card p-4 ${p.digest!.value === '高' ? 'border-primary/60' : ''}`}>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{date(p.takenAt)}</span>
                  <Badge variant={VALUE[p.digest!.value]}>含金量 {p.digest!.value}</Badge>
                </div>
                <p className="line-clamp-2 font-medium">{p.digest!.topic}</p>
                {p.digest!.points[0] && <p className="line-clamp-3 text-sm text-muted-foreground">{p.digest!.points[0]}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {stopReason && !mine && (
        <Alert variant="destructive">
          <AlertTitle>中途停下，已完成的部分都有保存</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{stopReason}</span>
            <Button size="sm" variant="outline" onClick={onRetry} disabled={!!run}><Play /> 繼續</Button>
          </AlertDescription>
        </Alert>
      )}

      {failed.length > 0 && !mine && (
        <Alert variant="destructive">
          <AlertTitle>{failed.length} 則處理失敗，下次按「開始萃取」會重試</AlertTitle>
          <AlertDescription>{failed[0].error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="kb">知識庫</TabsTrigger>
            {theories.map((d) => (
              <TabsTrigger key={d.topic} value={`theory:${d.topic}`}>理論對位：{d.topic}</TabsTrigger>
            ))}
            <TabsTrigger value="posts">貼文（{posts.length}）</TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" disabled={!!run || done === 0} onClick={() => setDialogTopic('')}
            title="把經驗對位到既有理論，產生新的一篇">
            <Plus /> 理論對位
          </Button>
        </div>

        <TabsContent value="kb" className="space-y-4 pt-4">
          {kb ? (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => download(`${creator.name}-知識庫.md`, kb.markdown)}>
                  <Download /> 下載 Markdown
                </Button>
              </div>
              <Markdown text={kb.markdown} tasks={{ checked, toggle }} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>還沒有知識庫</EmptyTitle>
                <EmptyDescription>按上方的按鈕開始，處理完會整合成一份知識庫。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

        {theories.map((d) => (
          <TabsContent key={d.topic} value={`theory:${d.topic}`} className="space-y-4 pt-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" disabled={!!run} onClick={() => setDialogTopic(d.topic)}>
                <RefreshCw /> {d.markdown ? '重新產生' : '繼續產生'}
              </Button>
              {d.markdown && (
                <Button variant="outline" size="sm" onClick={() => download(`${creator.name}-理論對位-${d.topic}.md`, d.markdown!)}>
                  <Download /> 下載 Markdown
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={mine} onClick={() => removeTheory(d.topic)}>
                <Trash2 /> 刪除
              </Button>
            </div>
            {d.markdown ? (
              <Markdown text={d.markdown} />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                  <EmptyTitle>{mine ? '產生中…' : '還沒產生完成'}</EmptyTitle>
                  <EmptyDescription>
                    {mine ? '進度在上方。' : '按「繼續產生」，已完成的步驟不會重做。'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
        ))}

        <TabsContent value="posts" className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">發文日期</TableHead>
                <TableHead>內容</TableHead>
                <TableHead className="w-20">狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="align-top text-muted-foreground">{date(p.takenAt)}</TableCell>
                  <TableCell className="max-w-0 whitespace-normal">
                    <a className="line-clamp-2 underline-offset-4 hover:underline"
                      href={`https://www.instagram.com/p/${p.code}/`} target="_blank" rel="noreferrer">
                      {p.digest?.topic ?? (p.caption || '（沒有文案）')}
                    </a>
                    {p.error && <p className="mt-1 text-xs text-destructive">{p.error}</p>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <TheoryDialog creator={creator} open={dialogTopic !== null} initialTopic={dialogTopic ?? ''}
        onOpenChange={(o) => !o && setDialogTopic(null)}
        onStart={(topic, sk) => (setTab(`theory:${topic}`), onTheory(topic, sk))} />
    </div>
  )
}
