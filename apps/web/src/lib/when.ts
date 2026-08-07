import { daysUntil, labelForDay } from './date'
import { MEAL_LABELS } from './format'
import type { Meal } from './types'

/** The target of an add: which day, which meal. Never one without the other. */
export interface When {
  day: string
  meal: Meal
}

/** Names the save action after what it actually does with the chosen day. */
export function saveActionLabel(value: When) {
  const delta = daysUntil(value.day)
  const day = labelForDay(value.day).toLowerCase()
  if (delta === 0) return `Aggiungi a ${MEAL_LABELS[value.meal]}`
  if (delta > 0) return `Pianifica per ${day} · ${MEAL_LABELS[value.meal]}`
  return `Aggiungi a ${MEAL_LABELS[value.meal]} · ${day}`
}

/** The confirmation that follows it, in the same words. */
export function savedToastMessage(name: string, value: When) {
  if (daysUntil(value.day) === 0)
    return `${name} aggiunto a ${MEAL_LABELS[value.meal]}`
  return `${name}: ${labelForDay(value.day).toLowerCase()} · ${MEAL_LABELS[value.meal]}`
}
