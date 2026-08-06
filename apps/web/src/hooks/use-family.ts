import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { groceryKey } from '@/hooks/use-grocery'
import { scansKey } from '@/hooks/use-scans'
import type {
  FamiliesResponse,
  Family,
  FamilyInvite,
  InvitePreview,
} from '@/lib/types'

export const familiesKey = ['families'] as const

/** Where a half-finished join is parked across login and onboarding. */
const PENDING_INVITE_KEY = 'calorico.pendingInvite'

export function setPendingInvite(token: string | null) {
  if (token) localStorage.setItem(PENDING_INVITE_KEY, token)
  else localStorage.removeItem(PENDING_INVITE_KEY)
}

export function getPendingInvite() {
  return localStorage.getItem(PENDING_INVITE_KEY)
}

export function useFamilies() {
  return useQuery({
    queryKey: familiesKey,
    queryFn: () => api<FamiliesResponse>('/families'),
  })
}

/** Membership changes move rows between lists, so both feeds have to refetch. */
function useSharedInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: familiesKey })
    void queryClient.invalidateQueries({ queryKey: groceryKey })
    void queryClient.invalidateQueries({ queryKey: scansKey })
  }
}

export function useCreateFamily() {
  const invalidate = useSharedInvalidation()
  return useMutation({
    mutationFn: (name: string) =>
      api<Family>('/families', { method: 'POST', body: { name } }),
    onSuccess: invalidate,
  })
}

export function useRenameFamily() {
  const invalidate = useSharedInvalidation()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<Family>(`/families/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: invalidate,
  })
}

export function useSetActiveFamily() {
  const invalidate = useSharedInvalidation()
  return useMutation({
    mutationFn: (id: string) =>
      api<{ activeFamilyId: string }>(`/families/${id}/active`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  })
}

export function useLeaveFamily() {
  const invalidate = useSharedInvalidation()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/families/${id}/members/me`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useFamilyInvite(familyId: string) {
  return useQuery({
    queryKey: ['families', familyId, 'invite'] as const,
    queryFn: () =>
      api<{ invite: FamilyInvite | null }>(`/families/${familyId}/invites`),
  })
}

export function useCreateInvite(familyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<FamilyInvite>(`/families/${familyId}/invites`, { method: 'POST' }),
    onSuccess: (invite) => {
      queryClient.setQueryData(['families', familyId, 'invite'], { invite })
    },
  })
}

export function useRevokeInvite(familyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) =>
      api(`/families/${familyId}/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(['families', familyId, 'invite'], {
        invite: null,
      })
    },
  })
}

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invite', token] as const,
    queryFn: () => api<InvitePreview>(`/families/invites/${token}`),
    enabled: Boolean(token),
    retry: false,
  })
}

export function useAcceptInvite() {
  const invalidate = useSharedInvalidation()
  return useMutation({
    mutationFn: (token: string) =>
      api<{ familyId: string; joined: boolean }>(
        `/families/invites/${token}/accept`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setPendingInvite(null)
      invalidate()
    },
  })
}

/** The invite link a member shares. Built here so the API stays origin-agnostic. */
export function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`
}
