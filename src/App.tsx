import { MoreHorizontal, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CreatorView } from '@/components/CreatorView'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Welcome } from '@/components/Welcome'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { LlmError } from '@/lib/llm'
import { processCreator, type Progress } from '@/lib/pipeline'
import { deleteCreator, getCreators, getSettings, onStoreChange } from '@/lib/store'
import type { Creator } from '@/types'

export interface Run {
  creator: string
  progress: Progress
}

export default function App() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Creator | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const abort = useRef<AbortController | null>(null)

  const reload = useCallback(() => getCreators().then(setCreators), [])
  useEffect(() => {
    reload()
    // 背景程式收集到新貼文時，清單即時更新（合併連續的變更，避免一直重讀）
    let t: ReturnType<typeof setTimeout>
    return onStoreChange(() => (clearTimeout(t), (t = setTimeout(reload, 400))))
  }, [reload])

  // 第一次使用：還沒填 Groq 金鑰就先打開設定
  useEffect(() => {
    getSettings().then((s) => !s.keys.groq && setSettingsOpen(true))
  }, [])

  // 處理中離開頁面會中斷，提醒使用者
  useEffect(() => {
    if (!run) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [run])

  const current = creators.find((c) => c.name === selected)

  async function start(creator: Creator) {
    if (run) return
    const ctrl = new AbortController()
    abort.current = ctrl
    setRun({ creator: creator.name, progress: { done: 0, total: 0, status: '準備中…' } })
    try {
      await processCreator(creator, ctrl.signal, (progress) => setRun({ creator: creator.name, progress }))
      if (!ctrl.signal.aborted) toast.success(`${creator.name} 的知識庫已更新`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg, { duration: 10000 })
      if (e instanceof LlmError && e.kind === 'auth') setSettingsOpen(true)
    } finally {
      abort.current = null
      setRun(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    await deleteCreator(toDelete)
    if (selected === toDelete.name) setSelected(null)
    toast(`已刪除 ${toDelete.name} 的所有資料`)
    setToDelete(null)
    reload()
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <button className="px-4 py-4 text-left text-lg font-semibold" onClick={() => setSelected(null)}>
          brand-digest
        </button>
        <Separator />
        <p className="px-4 pt-4 pb-2 text-xs text-muted-foreground">博主</p>
        <ScrollArea className="min-h-0 flex-1 px-2">
          {creators.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">還沒有收集任何博主。</p>}
          {creators.map((c) => (
            <div key={c.name} className="group flex items-center gap-1">
              <Button
                variant={c.name === selected ? 'secondary' : 'ghost'}
                className="min-w-0 flex-1 justify-between"
                onClick={() => setSelected(c.name)}
              >
                <span className="truncate">{c.name}</span>
                <Badge variant="outline">{c.codes.length}</Badge>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`${c.name} 的更多選項`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(c)} disabled={run?.creator === c.name}>
                    <Trash2 /> 刪除這位博主的資料
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </ScrollArea>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon /> 設定
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {current ? (
          <CreatorView
            key={current.name}
            creator={current}
            run={run}
            onStart={() => start(current)}
            onStop={() => abort.current?.abort()}
          />
        ) : (
          <Welcome hasCreators={creators.length > 0} />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除 {toDelete?.name}？</DialogTitle>
            <DialogDescription>
              會刪掉這位博主的 {toDelete?.codes.length} 則貼文、轉錄、萃取結果和知識庫，無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
