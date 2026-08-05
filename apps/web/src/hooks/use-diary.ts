import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  DiaryDay,
  DiaryEntry,
  Food,
  Meal,
  Profile,
  StatsResponse,
  TargetEstimate,
  WeightResponse,
} from '@/lib/types'

export const queryKeys = {
  diary: (day: string) => ['diary', day] as const,
  stats: (from: string, to: string) => ['stats', from, to] as const,
  weight: () => ['weight'] as const,
  search: (q: string) => ['foods', 'search', q] as const,
  food: (id: string) => ['foods', id] as const,
  recent: () => ['foods', 'recent'] as const,
  favorites: () => ['foods', 'favorites'] as const,
}

export function useDiary(day: string) {
  return useQuery({
    queryKey: queryKeys.diary(day),
    queryFn: () => api<DiaryDay>('/diary', { query: { day } }),
    placeholderData: keepPreviousData,
  })
}

export function useStats(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.stats(from, to),
    queryFn: () => api<StatsResponse>('/stats/daily', { query: { from, to } }),
    placeholderData: keepPreviousData,
  })
}

export function useWeight() {
  return useQuery({
    queryKey: queryKeys.weight(),
    queryFn: () => api<WeightResponse>('/weight'),
  })
}

export function useFoodSearch(query: string, enabled = true) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api<{ items: Food[] }>('/foods/search', { query: { q } }),
    enabled: enabled && q.length >= 2,
    placeholderData: keepPreviousData,
    // OFF round trips are slow; don't re-fetch the same term for a while.
    staleTime: 5 * 60_000,
  })
}

export function useFood(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.food(id ?? ''),
    queryFn: () => api<Food>(`/foods/${id}`),
    enabled: Boolean(id),
  })
}

export function useRecentFoods() {
  return useQuery({
    queryKey: queryKeys.recent(),
    queryFn: () => api<{ items: Food[] }>('/foods/recent'),
  })
}

export function useFavoriteFoods() {
  return useQuery({
    queryKey: queryKeys.favorites(),
    queryFn: () => api<{ items: Food[] }>('/foods/favorites'),
  })
}

/** Everything that changes a day's totals invalidates the same three keys. */
function useInvalidateDiary() {
  const queryClient = useQueryClient()
  return (day?: string) => {
    void queryClient.invalidateQueries({
      queryKey: day ? queryKeys.diary(day) : ['diary'],
    })
    void queryClient.invalidateQueries({ queryKey: ['stats'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.recent() })
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
      const key = queryKeys.diary(day)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<DiaryDay>(key)
      if (previous) {
        const entries = previous.entries.filter((e) => e.id !== id)
        queryClient.setQueryData<DiaryDay>(key, {
          ...previous,
          entries,
          byMeal: {
            breakfast: entries.filter((e) => e.meal === 'breakfast'),
            lunch: entries.filter((e) => e.meal === 'lunch'),
            dinner: entries.filter((e) => e.meal === 'dinner'),
            snack: entries.filter((e) => e.meal === 'snack'),
          },
          totals: entries.reduce(
            (acc, e) => ({
              kcal: acc.kcal + e.kcal,
              proteinG: acc.proteinG + e.proteinG,
              carbsG: acc.carbsG + e.carbsG,
              fatG: acc.fatG + e.fatG,
              fiberG: acc.fiberG + (e.fiberG ?? 0),
            }),
            { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
          ),
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

export function useLogWeight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { day: string; weightKg: number; note?: string }) =>
      api('/weight', { method: 'PUT', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weight() })
    },
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api(`/foods/${id}/favorite`, { method: next ? 'PUT' : 'DELETE' }),
    onSuccess: (_d, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.food(id) })
    },
  })
}

export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) => api<Food>(`/foods/barcode/${code}`),
  })
}

export function useCreateFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Food>('/foods', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['foods', 'search'] })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Profile> & { name?: string }) =>
      api<Profile>('/profile', { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['diary'] })
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useEstimateTargets() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<TargetEstimate>('/profile/estimate', { method: 'POST', body }),
  })
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ profile: Profile }>('/profile/onboarding', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.weight() })
    },
  })
}
