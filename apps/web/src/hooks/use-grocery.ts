import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/hooks/use-auth'
import { GROCERY_CATEGORY_ORDER } from '@/lib/format'
import { blobToBase64, compressImage } from '@/lib/image-compress'
import type {
  GroceryCategory,
  GroceryItem,
  GroceryResponse,
  GrocerySuggestionsResponse,
  GroceryUnit,
} from '@/lib/types'

/**
 * Mirrors the server's own `order by` — ticked-off rows last, then the aisle,
 * then newest first — so an optimistic row lands where the refetch will put it
 * instead of jumping once the response arrives.
 */
function sortItems(items: GroceryItem[]) {
  return items.toSorted((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed)
    const aisle =
      GROCERY_CATEGORY_ORDER.indexOf(a.category) -
      GROCERY_CATEGORY_ORDER.indexOf(b.category)
    if (aisle !== 0) return aisle
    const aDate = a.completed ? a.completedAt : a.createdAt
    const bDate = b.completed ? b.completedAt : b.createdAt
    return +new Date(bDate ?? 0) - +new Date(aDate ?? 0)
  })
}

/**
 * Rewrites the cached list, leaving everything else in the payload alone —
 * `imagesEnabled` is server configuration and a mutation has no opinion on it.
 * Nothing at all when the list has not been fetched yet: an invented payload
 * would tell the screen the cupboard has no photos.
 */
function patchList(
  queryClient: QueryClient,
  update: (items: GroceryItem[]) => GroceryItem[],
) {
  queryClient.setQueryData<GroceryResponse>(queryKeys.grocery.all, (current) =>
    current ? { ...current, items: update(current.items) } : current,
  )
}

export function useGrocery() {
  return useQuery({
    queryKey: queryKeys.grocery.all,
    queryFn: () => api<GroceryResponse>('/grocery'),
  })
}

/** Lines this list has held before, matched against what is being typed. */
export function useGrocerySuggestions(term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: queryKeys.grocery.suggestions(q),
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

export interface GroceryAddInput {
  foodId?: string
  name?: string
  quantity?: number
  unit?: GroceryUnit
  category?: GroceryCategory
}

export function useAddGroceryItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (body: GroceryAddInput) =>
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
      patchList(queryClient, (items) =>
        sortItems([withAuthor, ...items.filter((existing) => existing.id !== item.id)]),
      )
      // The row is on the list now, so it must drop out of the suggestions.
      void queryClient.invalidateQueries({ queryKey: queryKeys.grocery.suggestionsAll })
    },
  })
}

/**
 * Puts a scanned product on the shopping list only if the user says so.
 *
 * Scanning a barcode used to add the product to the list on its own. The intent
 * behind a scan at the fridge is to log what is being eaten, not to write a
 * shopping list, and the list quietly filled up with everything ever scanned.
 * So the add is offered on the confirmation instead, one tap away.
 *
 * The cupboard is the other answer to the same wish, and the better one: it
 * adds the product when it actually runs out. See use-pantry.
 */
export function useGroceryOffer() {
  const addItem = useAddGroceryItem()

  return (food: { id: string; name: string }, description?: string) =>
    toast.success(food.name, {
      description,
      action: {
        label: 'Alla spesa',
        onClick: () =>
          addItem.mutate(
            { foodId: food.id },
            {
              onSuccess: () => toast.success(`${food.name} è nella spesa`),
              onError: () =>
                toast.error('Aggiunta alla spesa non riuscita'),
            },
          ),
      },
    })
}

export function useUpdateGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      quantity?: number
      completed?: boolean
      unit?: GroceryUnit
      category?: GroceryCategory
    }) => api<GroceryItem>(`/grocery/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.grocery.all })
      const previous = queryClient.getQueryData<GroceryResponse>(queryKeys.grocery.all)
      const now = new Date().toISOString()
      patchList(queryClient, (items) =>
        sortItems(
          items.map((item) =>
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
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.grocery.all, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.grocery.all })
      // Ticking a tracked product off refills the cupboard on the server.
      void queryClient.invalidateQueries({ queryKey: queryKeys.pantry })
    },
  })
}

/**
 * A photo for the rows a name cannot pin down — the specific descaler, the tap
 * washer of the right size. Compressed in the browser first: a phone hands over
 * several megabytes for something a list renders at 44 px.
 */
export function useSetGroceryImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const { blob, contentType } = await compressImage(file, {
        maxEdge: 900,
        targetBytes: 180 * 1024,
      })
      return api<GroceryItem>(`/grocery/${id}/image`, {
        method: 'POST',
        body: { image: await blobToBase64(blob), contentType },
      })
    },
    onSuccess: (item) => {
      patchList(queryClient, (items) =>
        items.map((existing) =>
          existing.id === item.id ? { ...existing, ...item } : existing,
        ),
      )
    },
  })
}

export function useRemoveGroceryImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<GroceryItem>(`/grocery/${id}/image`, { method: 'DELETE' }),
    onSuccess: (item) => {
      patchList(queryClient, (items) =>
        items.map((existing) =>
          existing.id === item.id ? { ...existing, imagePath: null } : existing,
        ),
      )
    },
  })
}

export function useDeleteGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/grocery/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.grocery.all })
      const previous = queryClient.getQueryData<GroceryResponse>(queryKeys.grocery.all)
      patchList(queryClient, (items) => items.filter((item) => item.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.grocery.all, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.grocery.all })
    },
  })
}
