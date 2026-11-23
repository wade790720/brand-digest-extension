import { Check, ChevronDown, Magnifier } from '@gravity-ui/icons'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { useState, type CSSProperties } from 'react'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Creator } from '@/types'

const hue = (s: string) => (40 + [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)!) % 330, 7)) % 360

export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  if (src?.startsWith('data:image/'))
    return <img src={src} alt="" className={cn('size-7 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10', className)} />
  return (
    <span aria-hidden style={{ '--avatar-hue': hue(name) } as CSSProperties}
      className={cn('avatar-letter grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium uppercase', className)}>
      {name.slice(0, 1)}
    </span>
  )
}

export function CreatorSwitcher({ creators, current, onPick }: { creators: Creator[]; current?: string; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()
  const shown = q ? creators.filter((c) => `${c.name} ${c.fullName}`.toLowerCase().includes(q)) : creators
  const pick = (name: string) => {
    onPick(name)
    setOpen(false)
    setFind('')
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(o) => (setOpen(o), !o && setFind(''))}>
      <PopoverPrimitive.Trigger aria-label={t('app.creators')}
        className="flex h-9 w-72 min-w-0 shrink items-center gap-2 rounded-[calc(var(--radius)-2px)] border border-input bg-card px-3 text-left text-sm transition-[border-color,box-shadow] duration-[120ms] ease-[var(--ease-ui)] data-[state=open]:border-ring data-[state=open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_8%,transparent)] max-md:w-auto max-md:flex-1">
        <Magnifier className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-muted-foreground')}>{current ?? t('app.pickCreator')}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="end" sideOffset={6} collisionPadding={16}
          className="z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-transparent bg-popover p-1.5 text-popover-foreground shadow-[var(--pop-shadow)]">
          <div className="relative mb-1">
            <Magnifier className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('app.findCreator')} aria-label={t('app.findCreator')}
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) pick(shown[0].name) }}
              className="h-9 w-full rounded-md bg-transparent pr-2 pl-8 text-sm placeholder:text-muted-foreground focus-visible:outline-offset-0" />
          </div>
          <div className="-mx-1.5 mb-1 border-t" />
          <div className="scroll-fade flex max-h-[min(60vh,420px)] flex-col overflow-y-auto overscroll-contain">
            {shown.map((c) => (
              <button key={c.name} onClick={() => pick(c.name)} aria-current={c.name === current || undefined}
                className={cn('flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-[120ms] hover:bg-row-hover focus-visible:bg-row-hover', c.name === current && 'font-medium')}>
                <Avatar name={c.name} src={c.avatar} className="size-5 text-[0.6875rem]" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{c.codes.length}</span>
                <Check className={cn('size-4 shrink-0', c.name !== current && 'invisible')} aria-hidden />
              </button>
            ))}
            {!shown.length && <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">{t('app.noCreatorMatch')}</p>}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
