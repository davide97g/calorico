import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FoodImage } from '@/lib/types'

export const foodImageKeys = {
  list: (foodId: string) => ['foods', foodId, 'images'] as const,
}

export interface FoodImagesResponse {
  items: FoodImage[]
}

/**
 * Product shots for a food. Read-only: every photo comes from Open Food Facts,
 * and there is no upload path any more.
 */
export function useFoodImages(foodId: string | null | undefined) {
  return useQuery({
    queryKey: foodImageKeys.list(foodId ?? ''),
    queryFn: () => api<FoodImagesResponse>(`/foods/${foodId}/images`),
    enabled: Boolean(foodId),
  })
}
