import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from 'date-fns'
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

/**
 * Whole calendar days from `from` to `day`: 1 is tomorrow, -1 yesterday.
 * Built on Date.UTC so a DST change inside the span cannot round the
 * difference to 0.96 or 1.04 of a day.
 */
export function daysUntil(day: string, from = todayISO()) {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(day) - utc(from)) / 86_400_000)
}

/** "Oggi", "Domani", "Ieri", otherwise "lun 4 ago". */
export function labelForDay(day: string) {
  const d = parseISO(day)
  if (isToday(d)) return 'Oggi'
  if (isTomorrow(d)) return 'Domani'
  if (isYesterday(d)) return 'Ieri'
  return format(d, 'EEE d MMM', { locale: it })
}

export function shortDayLabel(day: string) {
  return format(parseISO(day), 'd', { locale: it })
}

export function weekdayLabel(day: string) {
  return format(parseISO(day), 'EEEEE', { locale: it })
}

/** "lun", "mar" — the day rail needs more than one letter to be readable. */
export function weekdayShortLabel(day: string) {
  return format(parseISO(day), 'EEE', { locale: it })
}

export function longDayLabel(day: string) {
  return format(parseISO(day), 'd MMMM yyyy', { locale: it })
}

export function lastNDays(n: number, endDay = todayISO()) {
  return { from: addDaysISO(endDay, -(n - 1)), to: endDay }
}

/**
 * Timestamps, not calendar days. Shared rows carry a full instant because
 * "chi e quando" only reads well at minute granularity.
 */

/** "2 minuti fa", "circa 3 ore fa". */
export function relativeTime(timestamp: string) {
  return formatDistanceToNow(parseISO(timestamp), {
    addSuffix: true,
    locale: it,
  })
}

/** "oggi 14:32", "ieri 09:05", otherwise "4 ago 14:32". */
export function dayTimeLabel(timestamp: string) {
  const d = parseISO(timestamp)
  const time = format(d, 'HH:mm', { locale: it })
  if (isToday(d)) return `oggi ${time}`
  if (isYesterday(d)) return `ieri ${time}`
  return `${format(d, 'd MMM', { locale: it })} ${time}`
}

/** The calendar day a timestamp falls on, for grouping feeds. */
export function dayOf(timestamp: string) {
  return toISODay(parseISO(timestamp))
}
