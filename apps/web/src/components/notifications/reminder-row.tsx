import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  clockTime,
  parseClockTime,
  weekdaysLabel,
} from '@/lib/format'
import type { Reminder, ReminderKind } from '@/lib/types'

/** What "already done" means for each kind, in the user's words. */
const SKIP_HINT: Record<ReminderKind, string> = {
  meal: 'Non inviare se il pasto è già nel diario',
  review: 'Non inviare se la giornata è già nell’intervallo di calorie',
  weight: 'Non inviare se ti sei già pesato oggi',
  custom: '',
}

interface ReminderRowProps {
  reminder: Reminder
  onChange: (
    patch: Partial<
      Pick<
        Reminder,
        'label' | 'atMinutes' | 'weekdays' | 'skipIfLogged' | 'enabled'
      >
    >,
  ) => void
  onDelete: () => void
}

export function ReminderRow({ reminder, onChange, onDelete }: ReminderRowProps) {
  const toggleDay = (day: number) => {
    const has = reminder.weekdays.includes(day)
    // A reminder with no days would never fire and the API rejects it, so the
    // last one standing is not removable.
    if (has && reminder.weekdays.length === 1) return
    const next = has
      ? reminder.weekdays.filter((d) => d !== day)
      : [...reminder.weekdays, day].toSorted((a, b) => a - b)
    onChange({ weekdays: next })
  }

  return (
    <li className="border-border/60 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Input
          type="time"
          value={clockTime(reminder.atMinutes)}
          onChange={(e) => {
            const minutes = parseClockTime(e.target.value)
            if (minutes !== null && minutes !== reminder.atMinutes) {
              onChange({ atMinutes: minutes })
            }
          }}
          aria-label={`Ora di ${reminder.label}`}
          className="tabular h-11 w-[108px] shrink-0 rounded-2xl font-semibold"
        />
        <Input
          defaultValue={reminder.label}
          maxLength={60}
          onBlur={(e) => {
            const label = e.target.value.trim()
            if (!label) {
              e.target.value = reminder.label
              return
            }
            if (label !== reminder.label) onChange({ label })
          }}
          aria-label="Nome del promemoria"
          className="h-11 min-w-0 flex-1 rounded-2xl"
        />
        <Switch
          checked={reminder.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          aria-label={`Attiva ${reminder.label}`}
          className="shrink-0"
        />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0 rounded-full"
          onClick={onDelete}
          aria-label={`Elimina ${reminder.label}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        className={`mt-2.5 flex gap-1 ${reminder.enabled ? '' : 'opacity-50'}`}
      >
        {WEEKDAY_INITIALS.map((initial, day) => {
          const selected = reminder.weekdays.includes(day)
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              aria-pressed={selected}
              aria-label={WEEKDAY_NAMES[day]}
              className={`focus-visible:outline-ring size-8 rounded-full text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {initial}
            </button>
          )
        })}
        <span className="text-muted-foreground ml-auto self-center text-[11px]">
          {weekdaysLabel(reminder.weekdays)}
        </span>
      </div>

      {reminder.kind === 'custom' ? null : (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11px] leading-relaxed">
            {SKIP_HINT[reminder.kind]}
          </span>
          <Switch
            size="sm"
            checked={reminder.skipIfLogged}
            onCheckedChange={(skipIfLogged) => onChange({ skipIfLogged })}
            aria-label={SKIP_HINT[reminder.kind]}
            className="shrink-0"
          />
        </div>
      )}
    </li>
  )
}
