import type { PushPayload } from '../push/send.js'

/**
 * The reminders we offer, and the words every reminder sends.
 *
 * Both live on the server on purpose. The suggested set has to be creatable by
 * `POST /notifications/reminders/defaults`, and the notification text is written
 * by the scheduler, which no browser is present for — so the client reads the
 * presets from `GET /notifications` instead of keeping a second copy that would
 * drift.
 */

export type ReminderKind = 'meal' | 'review' | 'weight' | 'custom'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** Postgres `extract(dow)` and JS `getDay()` agree: 0 is Sunday. */
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

export interface ReminderPreset {
  key: string
  kind: ReminderKind
  meal: Meal | null
  label: string
  atMinutes: number
  weekdays: number[]
  skipIfLogged: boolean
  /** Shown under the suggestion, so the skip rule is never a surprise. */
  description: string
}

const at = (hours: number, minutes = 0) => hours * 60 + minutes

export const REMINDER_PRESETS: ReminderPreset[] = [
  {
    key: 'breakfast',
    kind: 'meal',
    meal: 'breakfast',
    label: 'Colazione',
    atMinutes: at(8),
    weekdays: EVERY_DAY,
    skipIfLogged: true,
    description: 'Non arriva se la colazione è già nel diario.',
  },
  {
    key: 'lunch',
    kind: 'meal',
    meal: 'lunch',
    label: 'Pranzo',
    atMinutes: at(13),
    weekdays: EVERY_DAY,
    skipIfLogged: true,
    description: 'Non arriva se il pranzo è già nel diario.',
  },
  {
    key: 'snack',
    kind: 'meal',
    meal: 'snack',
    label: 'Spuntino',
    atMinutes: at(16, 30),
    weekdays: EVERY_DAY,
    skipIfLogged: true,
    description: 'Non arriva se hai già registrato uno spuntino.',
  },
  {
    key: 'dinner',
    kind: 'meal',
    meal: 'dinner',
    label: 'Cena',
    atMinutes: at(20),
    weekdays: EVERY_DAY,
    skipIfLogged: true,
    description: 'Non arriva se la cena è già nel diario.',
  },
  {
    key: 'review',
    kind: 'review',
    meal: null,
    label: 'Controllo della giornata',
    atMinutes: at(21, 30),
    weekdays: EVERY_DAY,
    skipIfLogged: true,
    description:
      'Un ultimo sguardo a calorie e macro. Non arriva se la giornata è già dentro l’intervallo di calorie.',
  },
  {
    key: 'weight',
    kind: 'weight',
    meal: null,
    label: 'Pesata del mattino',
    atMinutes: at(7, 30),
    weekdays: [1],
    skipIfLogged: true,
    description:
      'Solo il lunedì: il peso a stomaco vuoto è il più confrontabile. Non arriva se ti sei già pesato.',
  },
]

const MEAL_BODY: Record<Meal, string> = {
  breakfast: 'Registra la colazione nel diario.',
  lunch: 'Registra il pranzo nel diario.',
  dinner: 'Registra la cena nel diario.',
  snack: 'Registra lo spuntino nel diario.',
}

/**
 * The notification for one reminder. `label` is the user's own text, so it is
 * the title: a reminder they renamed has to arrive under the name they chose.
 */
export function reminderMessage(reminder: {
  kind: ReminderKind
  meal: Meal | null
  label: string
}): PushPayload {
  switch (reminder.kind) {
    case 'meal': {
      const meal = reminder.meal ?? 'snack'
      return {
        title: reminder.label,
        body: MEAL_BODY[meal],
        url: `/add?meal=${meal}`,
        tag: `meal-${meal}`,
      }
    }
    case 'review':
      return {
        title: reminder.label,
        body: 'Guarda come è andata oggi: calorie, proteine e macro.',
        url: '/',
        tag: 'review',
      }
    case 'weight':
      return {
        title: reminder.label,
        body: 'Registra il peso di oggi.',
        url: '/weight',
        tag: 'weight',
      }
    case 'custom':
      return {
        title: 'Calorico',
        body: reminder.label,
        url: '/',
        tag: 'custom',
      }
  }
}
