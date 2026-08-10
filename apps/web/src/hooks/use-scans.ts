import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ScansResponse } from '@/lib/types'

export const scansKey = ['scans'] as const

/** `term` filters the history by name; empty means the whole ranking. */
export function useScans(term = '') {
  const q = term.trim()
  return useInfiniteQuery({
    queryKey: [...scansKey, q],
    queryFn: ({ pageParam }) =>
      api<ScansResponse>('/scans', {
        query: { limit: 50, offset: pageParam, q: q || undefined },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  })
}
