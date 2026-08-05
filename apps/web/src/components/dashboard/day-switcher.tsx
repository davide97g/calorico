import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDaysISO, isFutureDay, labelForDay, todayISO } from '@/lib/date'

interface DaySwitcherProps {
  day: string
  onChange: (day: string) => void
}

/**
 * Just the date. "Copy yesterday" and "log weight" used to hide behind an
 * overflow menu here; both are now visible actions on the dashboard.
 */
export function DaySwitcher({ day, onChange }: DaySwitcherProps) {
  const canGoForward = !isFutureDay(addDaysISO(day, 1))

  return (
    <div className="flex items-center gap-2">
      <div className="bg-card shadow-soft flex items-center gap-1 rounded-full p-1 pl-3">
        <CalendarDays className="text-muted-foreground size-4" />
        <button
          type="button"
          onClick={() => onChange(addDaysISO(day, -1))}
          className="hover:bg-secondary active:bg-secondary flex size-9 items-center justify-center rounded-full transition-colors"
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
          className="hover:bg-secondary active:bg-secondary flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-30"
          aria-label="Giorno successivo"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {day !== todayISO() ? (
        <Button
          variant="secondary"
          size="sm"
          className="bg-card shadow-soft ml-auto h-9 rounded-full px-4"
          onClick={() => onChange(todayISO())}
        >
          Oggi
        </Button>
      ) : null}
    </div>
  )
}
