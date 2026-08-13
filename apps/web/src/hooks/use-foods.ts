import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys, type RecentInclude } from '@/lib/query-keys'
import type {
  Food,
  FoodImage,
  FoodPortions,
  Meal,
  NewFoodInput,
  RecentFood,
} from '@/lib/types'

/**
 * The catalogue: searching it, reading one food, and the two lists that make
 * logging a tap instead of a search — recents and favourites.
 *
 * Nothing here writes a diary entry. See use-diary.ts for that.
 */

export function useFoodSearch(query: string, enabled = true) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.foods.search(q),
    queryFn: () => api<{ items: Food[] }>('/foods/search', { query: { q } }),
    enabled: enabled && q.length >= 2,
    placeholderData: keepPreviousData,
    // OFF round trips are slow; don't re-fetch the same term for a while.
    staleTime: 5 * 60_000,
  })
}

export function useFood(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.foods.detail(id ?? ''),
    queryFn: () => api<Food>(`/foods/${id}`),
    enabled: Boolean(id),
  })
}

/**
 * Foods this user logs, best-remembered first, each with the portions they use.
 *
 * `meal` weights the ranking towards what gets eaten at that hour without
 * filtering the rest out, so a breakfast list is never empty.
 *
 * `include: 'all'` widens the list to foods merely met, for the Recenti tab on
 * the search screen. The callers that log a whole entry from one tap stay on the
 * default: they need the remembered portion, which only a logged food has.
 */
export function useRecentFoods(meal?: Meal, include: RecentInclude = 'logged') {
  return useQuery({
    queryKey: queryKeys.foods.recent(meal, include),
    queryFn: () =>
      api<{ items: RecentFood[] }>('/foods/recent', {
        query: { ...(meal ? { meal } : {}), include },
      }),
    placeholderData: keepPreviousData,
  })
}

/**
 * The portions this user weighs out for one food. Feeds the chips under the
 * quantity field, so the usual amount is a tap rather than a retype.
 */
export function useFoodPortions(foodId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.foods.portions(foodId ?? ''),
    queryFn: () => api<FoodPortions>(`/foods/${foodId}/portions`),
    enabled: Boolean(foodId),
  })
}

/**
 * Product shots for a food. Read-only: every photo comes from Open Food Facts,
 * and there is no upload path any more.
 */
export function useFoodImages(foodId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.foods.images(foodId ?? ''),
    queryFn: () => api<{ items: FoodImage[] }>(`/foods/${foodId}/images`),
    enabled: Boolean(foodId),
  })
}

export function useFavoriteFoods() {
  return useQuery({
    queryKey: queryKeys.foods.favorites,
    queryFn: () => api<{ items: Food[] }>('/foods/favorites'),
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api(`/foods/${id}/favorite`, { method: next ? 'PUT' : 'DELETE' }),
    onSuccess: (_d, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.favorites })
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.detail(id) })
    },
  })
}

export function useBarcodeLookup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<Food>(`/foods/barcode/${code}`),
    // The lookup put the product in this user's recents, server-side.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.recentAll })
    },
  })
}

export function useCreateFood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: NewFoodInput) =>
      api<Food>('/foods', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.searchAll })
      // A food created by hand is in recents before it is ever logged.
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods.recentAll })
    },
  })
}
