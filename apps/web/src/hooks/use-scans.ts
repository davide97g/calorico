import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { ScansResponse } from '@/lib/types'

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
