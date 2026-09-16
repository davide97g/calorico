import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { PantryItem, PantryResponse } from '@/lib/types'

/**
 * The cupboard. Every mutation here can put a row on the shopping list — that
 * is the point of the feature — so all of them invalidate the grocery key as
 * well, and none of them is optimistic: whether the stock crossed the line is
 * the server's arithmetic, and guessing it on the client would show a row that
 * is not there.
 */
export function usePantry() {
  return useQuery({
    queryKey: queryKeys.pantry,
    queryFn: () => api<PantryResponse>('/pantry'),
  })
}

function useAfterStockChange() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pantry })
    void queryClient.invalidateQueries({ queryKey: queryKeys.grocery.all })
  }
}

/** Puts packages in the cupboard, and starts tracking the product if new. */
export function useStockPantryItem() {
  const invalidate = useAfterStockChange()
  return useMutation({
    mutationFn: (body: {
      foodId: string
      packages?: number
      packageSizeG?: number
    }) => api<{ ok: true }>('/pantry', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

/**
 * Correcting the cupboard by hand. Zero on both counts is "it's finished", and
 * the server answers it the way running the product down would have.
 */
export function useUpdatePantryItem() {
  const invalidate = useAfterStockChange()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      sealedPackages?: number
      remainingG?: number
      packageSizeG?: number
    }) => api<PantryItem>(`/pantry/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

/** Stops tracking the product. Whatever is on the shopping list stays there. */
export function useDeletePantryItem() {
  const invalidate = useAfterStockChange()
  return useMutation({
    mutationFn: (id: string) => api(`/pantry/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
