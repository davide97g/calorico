import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { GroceryItem, GroceryResponse } from '@/lib/types'

export const groceryKey = ['grocery'] as const

function sortItems(items: GroceryItem[]) {
  return items.toSorted((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed)
    const aDate = a.completed ? a.completedAt : a.createdAt
    const bDate = b.completed ? b.completedAt : b.createdAt
    return +new Date(bDate ?? 0) - +new Date(aDate ?? 0)
  })
}

export function useGrocery() {
  return useQuery({
    queryKey: groceryKey,
    queryFn: () => api<GroceryResponse>('/grocery'),
  })
}

export function useAddGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { foodId?: string; name?: string; quantity?: number }) =>
      api<GroceryItem>('/grocery', { method: 'POST', body }),
    onSuccess: (item) => {
      queryClient.setQueryData<GroceryResponse>(groceryKey, (current) => ({
        items: sortItems([
          item,
          ...(current?.items.filter((existing) => existing.id !== item.id) ?? []),
        ]),
      }))
    },
  })
}

export function useUpdateGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; quantity?: number; completed?: boolean }) =>
      api<GroceryItem>(`/grocery/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: groceryKey })
      const previous = queryClient.getQueryData<GroceryResponse>(groceryKey)
      const now = new Date().toISOString()
      queryClient.setQueryData<GroceryResponse>(groceryKey, (current) => ({
        items: sortItems(
          (current?.items ?? []).map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...patch,
                  completedAt:
                    patch.completed === undefined
                      ? item.completedAt
                      : patch.completed
                        ? now
                        : null,
                  updatedAt: now,
                }
              : item,
          ),
        ),
      }))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(groceryKey, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groceryKey })
    },
  })
}

export function useDeleteGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/grocery/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: groceryKey })
      const previous = queryClient.getQueryData<GroceryResponse>(groceryKey)
      queryClient.setQueryData<GroceryResponse>(groceryKey, (current) => ({
        items: current?.items.filter((item) => item.id !== id) ?? [],
      }))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(groceryKey, context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groceryKey })
    },
  })
}
