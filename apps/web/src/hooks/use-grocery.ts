import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type {
  GroceryItem,
  GroceryResponse,
  GrocerySuggestionsResponse,
} from '@/lib/types'

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

export const grocerySuggestionsKey = [...groceryKey, 'suggestions'] as const

/**
 * Lines this list has held before, matched against what is being typed. Under
 * `groceryKey` so that every mutation's invalidation reaches it too: ticking a
 * row off or deleting it changes what deserves to be suggested.
 */
export function useGrocerySuggestions(term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: [...grocerySuggestionsKey, q],
    queryFn: () =>
      api<GrocerySuggestionsResponse>('/grocery/suggestions', {
        query: { q, limit: 5 },
      }),
    enabled: q.length > 0,
    // Hold the last answer while the next one loads: the rows must not blink
    // out from under a thumb that is already moving towards one.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export function useAddGroceryItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (body: { foodId?: string; name?: string; quantity?: number }) =>
      api<GroceryItem>('/grocery', { method: 'POST', body }),
    onSuccess: (item) => {
      // The insert returns the raw row; only the list endpoint joins the
      // author. Fill it in so a shared row doesn't flash without its avatar.
      const withAuthor: GroceryItem = {
        ...item,
        addedBy:
          item.addedBy ??
          (user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : undefined),
      }
      queryClient.setQueryData<GroceryResponse>(groceryKey, (current) => ({
        items: sortItems([
          withAuthor,
          ...(current?.items.filter((existing) => existing.id !== item.id) ?? []),
        ]),
      }))
      // The row is on the list now, so it must drop out of the suggestions.
      void queryClient.invalidateQueries({ queryKey: grocerySuggestionsKey })
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
