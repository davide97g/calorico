import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { MealAnalysis, VisionStatus } from '@/lib/types'

/**
 * Whether the server has a vision provider configured, and what is left of the
 * free allowance. The quota moves, so this one is not cached forever.
 */
export function useVisionStatus() {
  return useQuery({
    queryKey: queryKeys.vision.status,
    queryFn: () => api<VisionStatus>('/vision/status'),
    staleTime: 30_000,
  })
}

export function useAnalyzeMealPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { image: string; contentType: string }) =>
      api<MealAnalysis>('/vision/meal', { method: 'POST', body: input }),
    // One fewer photo left, whether the analysis found food or not.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vision.status })
      void queryClient.invalidateQueries({ queryKey: queryKeys.premium })
    },
  })
}
