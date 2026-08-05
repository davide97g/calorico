import { CalendarDays, ChevronLeft, ChevronRight, Copy, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { addDaysISO, isFutureDay, labelForDay, todayISO } from '@/lib/date'

interface DaySwitcherProps {
  day: string
  onChange: (day: string) => void
  onCopyYesterday?: () => void
  onOpenWeight?: () => void
}

export function DaySwitcher({
  day,
  onChange,
  onCopyYesterday,
  onOpenWeight,
}: DaySwitcherProps) {
  const canGoForward = !isFutureDay(addDaysISO(day, 1))

  return (
    <div className="flex items-center gap-2">
      <div className="bg-card shadow-soft flex items-center gap-1 rounded-full p-1 pl-3">
        <CalendarDays className="text-muted-foreground size-4" />
        <button
          type="button"
          onClick={() => onChange(addDaysISO(day, -1))}
          className="hover:bg-secondary flex size-7 items-center justify-center rounded-full"
          aria-label="Giorno precedente"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-[4.5rem] text-center text-sm font-semibold">
          {labelForDay(day)}
        </span>
        <button
          type="button"
          onClick={() => canGoForward && onChange(addDaysISO(day, 1))}
          disabled={!canGoForward}
          className="hover:bg-secondary flex size-7 items-center justify-center rounded-full disabled:opacity-30"
          aria-label="Giorno successivo"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {day !== todayISO() ? (
          <Button
            variant="secondary"
            size="sm"
            className="bg-card shadow-soft rounded-full"
            onClick={() => onChange(todayISO())}
          >
            Oggi
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="bg-card shadow-soft size-9 rounded-full"
              aria-label="Altre azioni"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            {onCopyYesterday ? (
              <DropdownMenuItem onClick={onCopyYesterday}>
                <Copy className="size-4" />
                Copia il giorno precedente
              </DropdownMenuItem>
            ) : null}
            {onOpenWeight ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenWeight}>
                  Registra il peso
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
