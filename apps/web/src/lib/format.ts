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

export function truncate(text: string, max = 42) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
