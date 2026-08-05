import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * The API stores diary days as plain calendar dates. Always derive them from
 * local time — toISOString() would move "today" to yesterday for anyone east
 * of Greenwich after midnight UTC.
 */
export function toISODay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO() {
  return toISODay(new Date())
}

export function addDaysISO(day: string, delta: number) {
  const d = parseISO(day)
  d.setDate(d.getDate() + delta)
  return toISODay(d)
}

export function isFutureDay(day: string) {
  return day > todayISO()
}

/** "Oggi", "Ieri", otherwise "lun 4 ago". */
export function labelForDay(day: string) {
  const d = parseISO(day)
  if (isToday(d)) return 'Oggi'
  if (isYesterday(d)) return 'Ieri'
  return format(d, 'EEE d MMM', { locale: it })
}

export function shortDayLabel(day: string) {
  return format(parseISO(day), 'd', { locale: it })
}

export function weekdayLabel(day: string) {
  return format(parseISO(day), 'EEEEE', { locale: it })
}

export function longDayLabel(day: string) {
  return format(parseISO(day), 'd MMMM yyyy', { locale: it })
}

export function lastNDays(n: number, endDay = todayISO()) {
  return { from: addDaysISO(endDay, -(n - 1)), to: endDay }
}
