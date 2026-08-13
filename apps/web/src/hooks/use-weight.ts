import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { WeightResponse } from '@/lib/types'

export function useWeight() {
  return useQuery({
    queryKey: queryKeys.weight,
    queryFn: () => api<WeightResponse>('/weight'),
  })
}

/**
 * One weigh-in per day, replaced rather than appended — hence PUT. Only the
 * weight feed changes: the diary's totals and targets do not move with it.
 */
export function useLogWeight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { day: string; weightKg: number; note?: string }) =>
      api('/weight', { method: 'PUT', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weight })
    },
  })
}
