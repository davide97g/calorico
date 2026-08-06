import type { Meal } from './types'

const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

export const kcal = (n: number) => nf0.format(Math.round(n))
export const grams = (n: number) => nf1.format(n)
export const pct = (n: number) => `${Math.round(n)}%`

export function signed(n: number, digits = 1) {
  const f = digits === 0 ? nf0 : nf1
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${f.format(Math.abs(n))}`
}

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Colazione',
  lunch: 'Pranzo',
  dinner: 'Cena',
  snack: 'Snack',
}

export const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_EMOJI: Record<Meal, string> = {
  breakfast: '🌅',
  lunch: '🍝',
  dinner: '🌙',
  snack: '🍎',
}

/** Guesses the meal from the clock so quick-add lands in the right bucket. */
export function currentMeal(now = new Date()): Meal {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 18) return 'snack'
  return 'dinner'
}

export const ACTIVITY_LABELS = {
  sedentary: 'Sedentario',
  light: 'Leggermente attivo',
  moderate: 'Moderatamente attivo',
  active: 'Attivo',
  very_active: 'Molto attivo',
} as const

export const ACTIVITY_HINTS = {
  sedentary: 'Lavoro da scrivania, niente allenamenti',
  light: '1-3 allenamenti a settimana',
  moderate: '3-5 allenamenti a settimana',
  active: '6-7 allenamenti a settimana',
  very_active: 'Lavoro fisico o doppi allenamenti',
} as const

export const SEX_LABELS = {
  male: 'Uomo',
  female: 'Donna',
} as const

export const GOAL_LABELS = {
  lose: 'Perdere peso',
  maintain: 'Mantenere',
  gain: 'Aumentare massa',
} as const

/** Percentage of a target, clamped for display only. */
export function progress(value: number, target: number) {
  if (!target) return 0
  return Math.max(0, Math.min(999, (value / target) * 100))
}

/**
 * Reminder times are stored as minutes since local midnight; "HH:MM" is what an
 * `<input type="time">` reads and writes.
 */
export function clockTime(minutes: number) {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Null for anything an empty or half-typed time field can hand us. */
export function parseClockTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Index is the weekday number the API uses: 0 = Sunday. */
export const WEEKDAY_INITIALS = ['D', 'L', 'M', 'M', 'G', 'V', 'S']
export const WEEKDAY_NAMES = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
]
const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

export function weekdaysLabel(days: number[]) {
  const set = new Set(days)
  if (set.size === 7) return 'Tutti i giorni'
  if (set.size === 5 && ![0, 6].some((d) => set.has(d))) return 'Da lunedì a venerdì'
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Sabato e domenica'
  // Monday first, the way an Italian week reads.
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => set.has(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
}

export function truncate(text: string, max = 42) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
