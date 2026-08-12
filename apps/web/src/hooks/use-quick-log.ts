import { toast } from 'sonner'
import { useAddEntry, useDeleteEntry } from '@/hooks/use-diary'
import { labelForDay } from '@/lib/date'
import { MEAL_LABELS, grams } from '@/lib/format'
import type { Food, Meal } from '@/lib/types'

interface QuickLogInput {
  food: Pick<Food, 'id' | 'name' | 'unit'>
  quantityG: number
  day: string
  meal: Meal
}

/**
 * Writing a whole diary entry from one tap.
 *
 * The confirmation carries what was written — food, portion, day and meal — and
 * an undo, because a one-tap action needs a one-tap way back: without it a
 * mis-tap costs a trip through the diary to find and delete the line.
 */
export function useQuickLog() {
  const addEntry = useAddEntry()
  const deleteEntry = useDeleteEntry()

  const log = ({ food, quantityG, day, meal }: QuickLogInput) =>
    addEntry.mutate(
      { foodId: food.id, day, meal, quantityG },
      {
        onSuccess: (entry) =>
          toast.success(`${food.name} · ${grams(quantityG)} ${food.unit}`, {
            description: `${labelForDay(day)} · ${MEAL_LABELS[meal]}`,
            action: {
              label: 'Annulla',
              onClick: () => deleteEntry.mutate({ id: entry.id, day }),
            },
          }),
        onError: () => toast.error('Non è stato possibile salvare la voce'),
      },
    )

  return {
    log,
    /** The food currently being written, so its row can show it is working. */
    loggingFoodId: addEntry.isPending ? addEntry.variables?.foodId : undefined,
  }
}
