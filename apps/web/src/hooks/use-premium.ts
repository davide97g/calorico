import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PremiumStatus } from '@/lib/types'

export const premiumKeys = {
  status: ['premium'] as const,
}

export function usePremium() {
  return useQuery({
    queryKey: premiumKeys.status,
    queryFn: () => api<PremiumStatus>('/premium'),
    staleTime: 30_000,
  })
}

/**
 * The placeholder checkout. No card, no charge, no payment provider: the server
 * flips a flag and answers. Everything that reads the flag is real, so swapping
 * this for a genuine payment means changing the endpoint and nothing else.
 */
export function useFakeCheckout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PremiumStatus>('/premium/checkout', { method: 'POST' }),
    onSuccess: (status) => {
      queryClient.setQueryData(premiumKeys.status, status)
      // The photo quota and /auth/me both carry the premium flag.
      void queryClient.invalidateQueries({ queryKey: ['vision', 'status'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

/** Back to the free tier — the only way to see the paywall a second time. */
export function useCancelPremium() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PremiumStatus>('/premium', { method: 'DELETE' }),
    onSuccess: (status) => {
      queryClient.setQueryData(premiumKeys.status, status)
      void queryClient.invalidateQueries({ queryKey: ['vision', 'status'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
