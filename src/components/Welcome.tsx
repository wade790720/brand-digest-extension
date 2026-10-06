import { BookOpen } from 'lucide-react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** 沒有選博主時的說明：怎麼收集。 */
export function Welcome({ hasCreators }: { hasCreators: boolean }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>{hasCreators ? '從左邊選一位博主' : '先去 IG 收集一位博主'}</EmptyTitle>
        <EmptyDescription>滑過博主的主頁，就把他的短影音整理成知識庫。不對 IG 多發任何請求。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ol className="list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
          <li>
            在 Chrome 打開博主的<strong className="text-foreground">主頁</strong>（instagram.com/帳號），不是 Reels 分頁。
          </li>
          <li>往下滑到你想要的範圍。工具列的 brand-digest 圖示會顯示收集了幾則。</li>
          <li>回到這裡，選那位博主，按「開始萃取」。</li>
        </ol>
      </EmptyContent>
    </Empty>
  )
}
