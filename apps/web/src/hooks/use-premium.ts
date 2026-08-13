import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { CheckoutSession, PremiumStatus } from '@/lib/types'

export function usePremium() {
  return useQuery({
    queryKey: queryKeys.premium,
    queryFn: () => api<PremiumStatus>('/premium'),
    staleTime: 30_000,
  })
}

/**
 * Everything that carries the premium flag: the status, the photo allowance
 * shown in the camera sheet, and the account behind /auth/me.
 */
function refreshPremium(
  queryClient: ReturnType<typeof useQueryClient>,
  status?: PremiumStatus,
) {
  if (status) queryClient.setQueryData(queryKeys.premium, status)
  void queryClient.invalidateQueries({ queryKey: queryKeys.vision.status })
  void queryClient.invalidateQueries({ queryKey: queryKeys.me })
}

/**
 * Starts the subscription. The server creates a Stripe Checkout session and
 * answers with its URL; the browser leaves the app for Stripe's own page and
 * comes back to /premium/return. Nothing here can grant premium — the flag is
 * written when Stripe tells the API the subscription is live.
 */
export function useCheckout() {
  return useMutation({
    mutationFn: async () => {
      const session = await api<CheckoutSession>('/premium/checkout', {
        method: 'POST',
      })
      // Assign rather than push: Stripe is a different origin, and the back
      // button should return to the app, not to a half-finished checkout.
      window.location.assign(session.url)
      // The redirect is not instant; resolving now would let the caller close
      // the sheet under the user's finger.
      await new Promise(() => {})
      return session
    },
  })
}

/**
 * Asks the API to read the subscription straight from Stripe. Used by the
 * return page: the webhook usually wins the race, and this covers the times it
 * does not — a local server Stripe cannot call back at all, for instance.
 */
export function useSyncPremium() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PremiumStatus>('/premium/sync', { method: 'POST' }),
    onSuccess: (status) => refreshPremium(queryClient, status),
  })
}

/**
 * The Stripe customer portal: card, invoices, cancellation. Sends the browser
 * away in the same way the checkout does.
 */
export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const session = await api<CheckoutSession>('/premium/portal', {
        method: 'POST',
      })
      window.location.assign(session.url)
      await new Promise(() => {})
      return session
    },
  })
}

/**
 * Cancels from inside the app, without a trip to the portal. Takes effect at
 * the end of the period already paid for, so premium stays on until then.
 */
export function useCancelPremium() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PremiumStatus>('/premium', { method: 'DELETE' }),
    onSuccess: (status) => refreshPremium(queryClient, status),
  })
}
