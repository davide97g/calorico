import { Apple, Moon, Soup, Sunrise, type LucideIcon } from 'lucide-react'
import type { Meal } from '@/lib/types'

/** Lucide instead of emoji: one icon family, themeable, same on every OS. */
export const MEAL_ICON: Record<Meal, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Soup,
  dinner: Moon,
  snack: Apple,
}

/**
 * The hue each meal is tinted with, defined in index.css so light and dark get
 * their own value. Read as a raw colour (not a Tailwind class) because the
 * diary mixes it into gradients with color-mix().
 */
export const MEAL_ACCENT: Record<Meal, string> = {
  breakfast: 'var(--meal-breakfast)',
  lunch: 'var(--meal-lunch)',
  dinner: 'var(--meal-dinner)',
  snack: 'var(--meal-snack)',
}

/**
 * The clock bands `currentMeal()` picks from. Shown on the meal tiles so the
 * automatic choice is a rule the user can read, not a guess.
 */
export const MEAL_HINT: Record<Meal, string> = {
  breakfast: 'fino alle 11',
  lunch: '11 – 15',
  dinner: 'dalle 18',
  snack: '15 – 18',
}
