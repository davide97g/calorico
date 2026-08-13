import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  BodyMetrics,
  Profile,
  SuggestedTargets,
  TargetEstimate,
} from '@/lib/types'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Profile> & { name?: string }) =>
      api<Profile>('/profile', { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me })
      // Targets are part of the diary and stats payloads, not a separate read.
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats.all })
      // Sex, birth date, activity and goal all move the suggestion.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profile.suggestedTargets,
      })
    },
  })
}

/**
 * What the formulas suggest for the stored metrics. 400s while onboarding is
 * incomplete, which is a normal state — no retry, and the UI just hides the hint.
 */
export function useSuggestedTargets() {
  return useQuery({
    queryKey: queryKeys.profile.suggestedTargets,
    queryFn: () => api<SuggestedTargets>('/profile/suggested'),
    retry: false,
  })
}

/**
 * The live preview under the onboarding form. Nothing is stored, so it writes
 * to no cache — the caller keeps the answer in state.
 */
export function useEstimateTargets() {
  return useMutation({
    mutationFn: (body: BodyMetrics) =>
      api<TargetEstimate>('/profile/estimate', { method: 'POST', body }),
  })
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyMetrics) =>
      api<{ profile: Profile }>('/profile/onboarding', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me })
      // Onboarding stores the starting weight as the first weigh-in.
      void queryClient.invalidateQueries({ queryKey: queryKeys.weight })
    },
  })
}
