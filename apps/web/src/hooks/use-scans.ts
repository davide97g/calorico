import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ScansResponse } from '@/lib/types'

export const scansKey = ['scans'] as const

export function useScans() {
  return useInfiniteQuery({
    queryKey: scansKey,
    queryFn: ({ pageParam }) =>
      api<ScansResponse>('/scans', {
        query: { limit: 50, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
