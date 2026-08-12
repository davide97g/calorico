import { useEffect, useRef, useState } from 'react'
import {
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Check,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { MEAL_HINT, MEAL_ICON } from '@/components/food/meal-icon'
import {
  addDaysISO,
  daysUntil,
  labelForDay,
  longDayLabel,
  shortDayLabel,
  todayISO,
  weekdayShortLabel,
} from '@/lib/date'
import { MEAL_LABELS, MEAL_ORDER } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { When } from '@/lib/when'
import type { Meal } from '@/lib/types'

/** Days the rail offers without asking for a date: today plus two weeks. */
const RAIL_DAYS = 14
/** How far the manual date field lets the user plan in either direction. */
const HORIZON_DAYS = 365

/** "Oggi", "Domani", "+3", "Ieri", "-3" — distance is what planning is about. */
function offsetLabel(day: string) {
  const delta = daysUntil(day)
  if (delta === 0) return 'Oggi'
  if (delta === 1) return 'Domani'
  if (delta === -1) return 'Ieri'
  return delta > 0 ? `+${delta}` : `${delta}`
}

/** Rail days, always including whatever is selected — even a far-off date. */
function railDays(selected: string) {
  const today = todayISO()
  const days = new Set([selected])
  for (let i = 0; i < RAIL_DAYS; i++) days.add(addDaysISO(today, i))
  return [...days].sort()
}

interface WhenSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: When
  onConfirm: (value: When) => void
  /** Says what confirming does: "Conferma" here, "Continua" on the dashboard. */
  confirmLabel?: string
}

/**
 * One sheet for the whole "when" question. Day and meal are picked together
 * because they answer it together: choosing tomorrow without choosing whether
 * it is lunch or dinner leaves the entry half-planned.
 */
export function WhenSheet({
  open,
  onOpenChange,
  value,
  onConfirm,
  confirmLabel = 'Conferma',
}: WhenSheetProps) {
  const [day, setDay] = useState(value.day)
  const [meal, setMeal] = useState<Meal>(value.meal)
  const dateRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Reopening starts from whatever the screen currently targets, not from the
  // draft the user abandoned last time.
  useEffect(() => {
    if (open) {
      setDay(value.day)
      setMeal(value.meal)
    }
  }, [open, value.day, value.meal])

  // A selection far down the rail has to be visible to be checkable.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() =>
      selectedRef.current?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
      }),
    )
    return () => cancelAnimationFrame(id)
  }, [open])

  const today = todayISO()
  const days = railDays(day)

  const openDateField = () => {
    const el = dateRef.current
    if (!el) return
    // showPicker() opens the native calendar directly; Safari falls back to a
    // plain focus, which still opens its own wheel.
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-[440px] rounded-t-xl">
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Quando lo mangi?</DrawerTitle>
          <DrawerDescription>
            Oggi, domani o fra qualche giorno. Il pasto lo scegli tu.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {/* The manual date sits with the section label, not at the far end
              of the rail: an escape hatch nobody scrolls to is not one. */}
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-muted-foreground text-micro font-bold tracking-wide uppercase">
              Giorno
            </p>
            <button
              type="button"
              onClick={openDateField}
              className="text-primary-strong flex h-8 items-center gap-1.5 text-micro font-bold"
            >
              <CalendarPlus className="size-4" strokeWidth={2.4} />
              Altra data
            </button>
          </div>
          <div
            role="radiogroup"
            aria-label="Giorno"
            className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"
          >
            {days.map((d) => {
              const active = d === day
              return (
                <button
                  key={d}
                  ref={active ? selectedRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDay(d)}
                  className={cn(
                    'flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-0.5 rounded-lg py-2.5 transition-colors active:scale-[0.97]',
                    active
                      ? 'bg-primary text-primary-foreground shadow-float'
                      : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'text-micro font-bold',
                      active ? 'opacity-80' : 'text-muted-foreground',
                    )}
                  >
                    {offsetLabel(d)}
                  </span>
                  <span className="font-display tabular text-display-sm leading-none font-extrabold">
                    {shortDayLabel(d)}
                  </span>
                  <span
                    className={cn(
                      'text-micro font-semibold',
                      active ? 'opacity-80' : 'text-muted-foreground',
                    )}
                  >
                    {weekdayShortLabel(d)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* The escape hatch for anything the rail does not reach. Visually
              hidden, never keyboard-hidden: "Altra data" above focuses it. */}
          <input
            ref={dateRef}
            type="date"
            value={day}
            min={addDaysISO(today, -HORIZON_DAYS)}
            max={addDaysISO(today, HORIZON_DAYS)}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value)
            }}
            aria-label="Scegli un'altra data"
            tabIndex={-1}
            className="size-px overflow-hidden opacity-0"
          />

          <p className="text-muted-foreground mt-4 mb-2 px-1 text-micro font-bold tracking-wide uppercase">
            Pasto
          </p>
          <div
            role="radiogroup"
            aria-label="Pasto"
            className="grid grid-cols-2 gap-2"
          >
            {MEAL_ORDER.map((m) => {
              const Icon = MEAL_ICON[m]
              const active = m === meal
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMeal(m)}
                  className={cn(
                    'flex min-h-16 items-center gap-2.5 rounded-lg px-3 text-left transition-colors active:scale-[0.98]',
                    active
                      ? 'bg-primary text-primary-foreground shadow-float'
                      : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-5 shrink-0',
                      !active && 'text-primary-strong',
                    )}
                    strokeWidth={2.3}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">
                      {MEAL_LABELS[m]}
                    </span>
                    <span
                      className={cn(
                        'block text-micro font-semibold',
                        active ? 'opacity-80' : 'text-muted-foreground',
                      )}
                    >
                      {MEAL_HINT[m]}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-background border-border/60 shrink-0 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="mb-3 flex items-baseline justify-between gap-2 px-1">
            <span className="text-sm font-bold">
              {labelForDay(day)} · {MEAL_LABELS[meal]}
            </span>
            <span className="text-muted-foreground truncate text-micro font-semibold">
              {longDayLabel(day)}
            </span>
          </p>
          <Button
            className="shadow-float h-13 w-full rounded-full text-base font-semibold"
            onClick={() => {
              onConfirm({ day, meal })
              onOpenChange(false)
            }}
          >
            <Check className="size-5" />
            {confirmLabel}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

interface WhenBarProps {
  value: When
  onChange: (value: When) => void
  /** `inset` for use inside a panel, where a second white card would vanish. */
  variant?: 'card' | 'inset'
  className?: string
}

/**
 * The row that carries the target through every add flow. Reads as a plain
 * summary while the entry lands today, and turns into a "planned" state — the
 * only place in these screens that borrows the lime fill — once it does not.
 */
export function WhenBar({
  value,
  onChange,
  variant = 'card',
  className,
}: WhenBarProps) {
  const [open, setOpen] = useState(false)
  const planned = daysUntil(value.day) > 0
  const Icon = planned ? CalendarCheck2 : CalendarClock
  const inset = variant === 'inset'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-lg p-2.5 text-left transition-transform active:scale-[0.99]',
          inset ? 'bg-secondary/70' : 'bg-card shadow-soft',
          className,
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            planned
              ? 'bg-primary text-primary-foreground'
              : inset
                ? 'bg-card text-primary-strong'
                : 'bg-secondary text-primary-strong',
          )}
        >
          <Icon className="size-4.5" strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-micro font-bold tracking-wide uppercase">
            {planned ? 'Pianificato' : 'Quando'}
          </span>
          <span className="block truncate text-sm font-semibold">
            {labelForDay(value.day)} · {MEAL_LABELS[value.meal]}
          </span>
        </span>
        <span
          className={cn(
            'flex h-9 shrink-0 items-center rounded-full px-3.5 text-micro font-bold',
            planned
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-accent text-accent-foreground',
          )}
        >
          {planned ? 'Modifica' : 'Pianifica per dopo'}
        </span>
      </button>

      <WhenSheet
        open={open}
        onOpenChange={setOpen}
        value={value}
        onConfirm={onChange}
      />
    </>
  )
}
