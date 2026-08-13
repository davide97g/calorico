import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { groupByMeal, sumTotals } from '@/lib/nutrition'
import type { BatchEntryInput, DiaryDay, DiaryEntry, Meal } from '@/lib/types'

/**
 * The diary itself: one day's entries, and everything that writes to them.
 *
 * The neighbouring hooks split off by domain — use-stats, use-weight, use-foods,
 * use-vision, use-profile — read what the diary feeds. Anything that changes a
 * day's totals belongs here, so `useInvalidateDiary` stays the single answer to
 * "what else has to refetch?".
 */

export function useDiary(day: string) {
  return useQuery({
    queryKey: queryKeys.diary.day(day),
    queryFn: () => api<DiaryDay>('/diary', { query: { day } }),
    placeholderData: keepPreviousData,
  })
}

/** Everything that changes a day's totals invalidates the same four keys. */
function useInvalidateDiary() {
  const queryClient = useQueryClient()
  return (day?: string) => {
    void queryClient.invalidateQueries({
      queryKey: day ? queryKeys.diary.day(day) : queryKeys.diary.all,
    })
    void queryClient.invalidateQueries({ queryKey: queryKeys.stats.all })
    // Every meal's ranking moved, and so did the portions it remembers.
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods.recentAll })
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods.portionsAll })
  }
}

export function useAddEntry() {
  const invalidate = useInvalidateDiary()
  return useMutation({
    mutationFn: (input: {
      foodId: string
      day: string
      meal: Meal
      quantityG: number
      // The created row comes back so a one-tap add can offer an undo.
    }) => api<DiaryEntry>('/diary', { method: 'POST', body: input }),
    onSuccess: (_data, input) => invalidate(input.day),
  })
}

/**
 * Saves a whole reviewed meal in one transaction — what the photo flow ends on.
 * Invalidates exactly what a single add does, plus the search cache, since
 * AI-estimated foods become new catalogue rows.
 */
export function useAddEntries() {
  const invalidate = useInvalidateDiary()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      day: string
      meal: Meal
      items: BatchEntryInput[]
    }) =>
      api<{ entries: DiaryEntry[] }>('/diary/batch', {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_data, input) => {
      invalidate(input.day)
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.searchAll })
    },
  })
}

export function useUpdateEntry() {
  const invalidate = useInvalidateDiary()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      quantityG?: number
      meal?: Meal
      day?: string
    }) => api(`/diary/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteEntry() {
  const invalidate = useInvalidateDiary()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; day: string }) =>
      api(`/diary/${id}`, { method: 'DELETE' }),
    // Optimistic: removing a line should feel instant.
    onMutate: async ({ id, day }) => {
      const key = queryKeys.diary.day(day)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<DiaryDay>(key)
      if (previous) {
        const entries = previous.entries.filter((e) => e.id !== id)
        queryClient.setQueryData<DiaryDay>(key, {
          ...previous,
          entries,
          byMeal: groupByMeal(entries),
          totals: sumTotals(entries),
        })
      }
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous)
      }
    },
    onSettled: (_d, _e, vars) => invalidate(vars.day),
  })
}

export function useCopyDay() {
  const invalidate = useInvalidateDiary()
  return useMutation({
    mutationFn: (input: { from: string; to: string; meal?: Meal }) =>
      api<{ copied: number }>('/diary/copy', { method: 'POST', body: input }),
    onSuccess: (_d, input) => invalidate(input.to),
  })
}
