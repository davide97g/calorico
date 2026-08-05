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
    <div className="bg-card shadow-soft flex min-h-14 items-center rounded-[22px] p-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
        <span className="bg-secondary text-primary-strong flex size-8 shrink-0 items-center justify-center rounded-full">
          <CalendarDays className="size-4" />
        </span>
        <span className="text-[15px] font-bold">{labelForDay(day)}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(addDaysISO(day, -1))}
          className="hover:bg-secondary active:bg-secondary flex size-10 items-center justify-center rounded-full transition-colors"
          aria-label="Giorno precedente"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => canGoForward && onChange(addDaysISO(day, 1))}
          disabled={!canGoForward}
          className="hover:bg-secondary active:bg-secondary flex size-10 items-center justify-center rounded-full transition-colors disabled:opacity-30"
          aria-label="Giorno successivo"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {day !== todayISO() ? (
        <Button
          variant="secondary"
          size="sm"
          className="bg-secondary h-10 rounded-[16px] px-4"
          onClick={() => onChange(todayISO())}
        >
          Oggi
        </Button>
      ) : null}
    </div>
  )
}
