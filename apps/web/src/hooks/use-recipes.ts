import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { Recipe, RecipeInput } from '@/lib/types'

/**
 * The cookbook: dishes this user composed out of other foods.
 *
 * Every mutation here also rewrites the `foods` row behind the recipe — that is
 * what a recipe is — so each one invalidates the catalogue queries too. Miss
 * that and a dish keeps its old calories in search and in Recenti until the
 * caches expire, which is the kind of stale number nobody thinks to distrust.
 */

function useRecipeInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods.searchAll })
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods.recentAll })
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods.favorites })
  }
}

export function useRecipes() {
  return useQuery({
    queryKey: queryKeys.recipes.all,
    queryFn: () => api<{ items: Recipe[] }>('/recipes'),
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recipes.detail(id ?? ''),
    queryFn: () => api<Recipe>(`/recipes/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateRecipe() {
  const invalidate = useRecipeInvalidation()
  return useMutation({
    mutationFn: (body: RecipeInput) =>
      api<Recipe>('/recipes', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useUpdateRecipe() {
  const invalidate = useRecipeInvalidation()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<RecipeInput> & { id: string }) =>
      api<Recipe>(`/recipes/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useDeleteRecipe() {
  const invalidate = useRecipeInvalidation()
  return useMutation({
    mutationFn: (id: string) => api(`/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
