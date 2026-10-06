import { ExternalLink, FileText, Loader2, Play, Square } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Run } from '@/App'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getKnowledgeBase, getPosts, onStoreChange } from '@/lib/store'
import type { Creator, KnowledgeBase, Post } from '@/types'

const STATUS: Record<Post['status'], { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  new: { label: '待處理', variant: 'secondary' },
  done: { label: '完成', variant: 'default' },
  error: { label: '失敗', variant: 'destructive' },
}

const date = (sec: number) => (sec ? new Date(sec * 1000).toLocaleDateString('zh-TW') : '')

export function CreatorView({ creator, run, stopReason, onStart, onStop }: {
  creator: Creator
  run: Run | null
  stopReason?: string
  onStart: () => void
  onStop: () => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [kb, setKb] = useState<KnowledgeBase>()

  const load = useCallback(async () => {
    setPosts(await getPosts(creator))
    setKb(await getKnowledgeBase(creator.name))
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
          <AlertTitle>萃取中途停下，已完成的部分都有保存</AlertTitle>
          <AlertDescription>{stopReason}</AlertDescription>
        </Alert>
      )}

      {failed.length > 0 && !mine && (
        <Alert variant="destructive">
          <AlertTitle>{failed.length} 則處理失敗，下次按「開始萃取」會重試</AlertTitle>
          <AlertDescription>{failed[0].error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="kb">
        <TabsList>
          <TabsTrigger value="kb">知識庫</TabsTrigger>
          <TabsTrigger value="posts">貼文（{posts.length}）</TabsTrigger>
        </TabsList>

        <TabsContent value="kb" className="pt-4">
          {kb ? (
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}>
                {kb.markdown}
              </ReactMarkdown>
            </article>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>還沒有知識庫</EmptyTitle>
                <EmptyDescription>按「開始萃取」，處理完會整合成一份知識庫。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

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
    </div>
  )
}
