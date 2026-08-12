import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { queryKeys, useDeleteEntry } from '@/hooks/use-diary'
import { labelForDay } from '@/lib/date'
import { kcal, MEAL_LABELS } from '@/lib/format'
import type { DiaryEntry, Meal, SavedMeal } from '@/lib/types'

export const mealKeys = {
  all: ['meals'] as const,
  list: (meal?: Meal) => ['meals', meal ?? 'any'] as const,
}

export function useSavedMeals(meal?: Meal) {
  return useQuery({
    queryKey: mealKeys.list(meal),
    queryFn: () =>
      api<{ items: SavedMeal[] }>('/meals', {
        query: meal ? { meal } : undefined,
      }),
  })
}

export function useCreateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      meal: Meal
      items: { foodId: string; quantityG: number }[]
    }) => api<SavedMeal>('/meals', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mealKeys.all })
    },
  })
}

export function useUpdateMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name?: string
      meal?: Meal
    }) => api<SavedMeal>(`/meals/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mealKeys.all })
    },
  })
}

export function useDeleteMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/meals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mealKeys.all })
    },
  })
}

export function useLogMeal() {
  const queryClient = useQueryClient()
  const deleteEntry = useDeleteEntry()
  return useMutation({
    mutationFn: (input: { id: string; day: string; meal: Meal }) =>
      api<{ entries: DiaryEntry[] }>(`/meals/${input.id}/log`, {
        method: 'POST',
        body: { day: input.day, meal: input.meal },
      }),
    onSuccess: (data, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(input.day) })
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      void queryClient.invalidateQueries({ queryKey: ['foods', 'recent'] })
      void queryClient.invalidateQueries({ queryKey: mealKeys.all })
      const total = data.entries.reduce((s, e) => s + e.kcal, 0)
      toast.success(`${data.entries.length} voci · ${kcal(total)} kcal`, {
        description: `${labelForDay(input.day)} · ${MEAL_LABELS[input.meal]}`,
        action: {
          label: 'Annulla',
          onClick: () => {
            for (const entry of data.entries) {
              deleteEntry.mutate({ id: entry.id, day: input.day })
            }
          },
        },
      })
    },
    onError: () => toast.error('Non è stato possibile registrare il piatto'),
  })
}

/** Foods that still exist, ready to become a piatto. Snapshot-only rows are skipped. */
export function mealItemsFromEntries(
  entries: { foodId: string | null; quantityG: number }[],
) {
  return entries.flatMap((e) =>
    e.foodId ? [{ foodId: e.foodId, quantityG: e.quantityG }] : [],
  )
}
