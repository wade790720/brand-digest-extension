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
import { deleteTheory, getKnowledgeBase, getPosts, getTheories, onStoreChange } from '@/lib/store'
import { download } from '@/lib/utils'
import type { Creator, KnowledgeBase, Post, Theory, TheoryDoc } from '@/types'

const STATUS: Record<Post['status'], { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  new: { label: '待處理', variant: 'secondary' },
  done: { label: '完成', variant: 'default' },
  error: { label: '失敗', variant: 'destructive' },
}

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

function Markdown({ text }: { text: string }) {
  return (
    <article className="prose prose-neutral max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeBr]}
        components={{
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

export function CreatorView({ creator, run, stopReason, onStart, onTheory, onStop }: {
  creator: Creator
  run: Run | null
  stopReason?: string
  onStart: () => void
  onTheory: (topic: string, skeleton: Theory[]) => void
  onStop: () => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [kb, setKb] = useState<KnowledgeBase>()
  const [theories, setTheories] = useState<TheoryDoc[]>([])
  const [tab, setTab] = useState('kb') // kb、posts，或 theory:<主題>
  const [dialogTopic, setDialogTopic] = useState<string | null>(null) // null＝對話框關著

  const load = useCallback(async () => {
    setPosts(await getPosts(creator))
    setKb(await getKnowledgeBase(creator.name))
    setTheories(Object.values(await getTheories(creator.name)))
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
            <div className="ml-auto">
              {mine ? (
                <Button variant="outline" onClick={onStop}><Square /> 停止</Button>
              ) : (
                <Button onClick={onStart} disabled={busyElsewhere || posts.length === 0}>
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
            <p className="text-xs text-muted-foreground">想收集更多：回到她的 IG 主頁繼續往下滑，新貼文會自動加進來。</p>
          )}
        </CardContent>
      </Card>

      {stopReason && !mine && (
        <Alert variant="destructive">
          <AlertTitle>中途停下，已完成的部分都有保存</AlertTitle>
          <AlertDescription>{stopReason}</AlertDescription>
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
              <Markdown text={kb.markdown} />
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
