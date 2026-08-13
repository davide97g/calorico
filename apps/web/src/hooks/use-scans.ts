import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/hooks/use-auth'
import type { PersonRef, ScansResponse } from '@/lib/types'

/** `term` filters the history by name; empty means the whole ranking. */
export function useScans(term = '') {
  const q = term.trim()
  return useInfiniteQuery({
    queryKey: queryKeys.scans.list(q),
    queryFn: ({ pageParam }) =>
      api<ScansResponse>('/scans', {
        query: { limit: 50, offset: pageParam, q: q || undefined },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  })
}

/**
 * Who else scanned each food, keyed by food id, for the lists that show foods
 * rather than scans — search results, recents, favourites.
 *
 * The scan feed is the family's, so a row in those lists can carry the face of
 * the person who brought the thing home: "this yogurt is in the fridge because
 * Anna scanned it yesterday" is the answer to a question the plain catalogue row
 * cannot even ask.
 *
 * The signed-in user is left out on purpose. Their own scans are the whole
 * feed on a solo account, and an avatar of yourself on every row says nothing.
 */
export function useScannedByFood(term = ''): Map<string, PersonRef> {
  const { user } = useAuth()
  const scans = useScans(term)
  const pages = scans.data?.pages

  return useMemo(() => {
    const byFood = new Map<string, PersonRef>()
    for (const page of pages ?? []) {
      for (const scan of page.items) {
        // Ranked list: the first row for a food is its best-remembered scan.
        if (!scan.foodId || scan.scannedBy.id === user?.id) continue
        if (!byFood.has(scan.foodId)) byFood.set(scan.foodId, scan.scannedBy)
      }
    }
    return byFood
  }, [pages, user?.id])
}
