import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameMonth,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfMonth,
  startOfWeek,
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
 * Week and month buckets. The API folds days with `date_trunc`, whose weeks
 * start on Monday; these helpers have to agree with it exactly, or the range a
 * screen asks for and the buckets it gets back drift apart by a day.
 */
const MONDAY = { weekStartsOn: 1 } as const

export function startOfWeekISO(day: string) {
  return toISODay(startOfWeek(parseISO(day), MONDAY))
}

export function endOfWeekISO(day: string) {
  return toISODay(endOfWeek(parseISO(day), MONDAY))
}

export function startOfMonthISO(day: string) {
  return toISODay(startOfMonth(parseISO(day)))
}

export function endOfMonthISO(day: string) {
  return toISODay(endOfMonth(parseISO(day)))
}

export function addWeeksISO(day: string, delta: number) {
  return addDaysISO(day, delta * 7)
}

export function addMonthsISO(day: string, delta: number) {
  return toISODay(addMonths(parseISO(day), delta))
}

/**
 * The last `n` whole weeks up to and including the one `endDay` falls in. The
 * running week is deliberately left short: three days of a week are three days,
 * and an average that pretends otherwise is the wrong number.
 */
export function lastNWeeks(n: number, endDay = todayISO()) {
  return { from: startOfWeekISO(addWeeksISO(endDay, -(n - 1))), to: endDay }
}

export function lastNMonths(n: number, endDay = todayISO()) {
  return { from: startOfMonthISO(addMonthsISO(endDay, -(n - 1))), to: endDay }
}

/** "3 – 9 ago", or "27 lug – 2 ago" when the week straddles two months. */
export function weekRangeLabel(from: string, to: string) {
  const start = parseISO(from)
  const end = parseISO(to)
  const endLabel = format(end, 'd MMM', { locale: it })
  const startLabel = isSameMonth(start, end)
    ? format(start, 'd', { locale: it })
    : format(start, 'd MMM', { locale: it })
  return from === to ? endLabel : `${startLabel} – ${endLabel}`
}

/** "agosto 2026" — the year matters once the chart reaches back past January. */
export function monthLabel(day: string) {
  return format(parseISO(day), 'LLLL yyyy', { locale: it })
}

/** "ago", for an axis tick where the full month name would never fit. */
export function shortMonthLabel(day: string) {
  return format(parseISO(day), 'LLL', { locale: it })
}

/** 0 = Sunday, matching the API's `extract(dow)` and WEEKDAY_INITIALS. */
export function weekdayIndex(day: string) {
  return parseISO(day).getDay()
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
