import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  PushError,
  currentSubscription,
  pushPermission,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSubscriptionPayload,
} from '@/lib/push'
import type {
  Meal,
  NotificationSettings,
  Reminder,
  ReminderKind,
} from '@/lib/types'

export const notificationKey = ['notifications'] as const

export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationKey,
    queryFn: () => api<NotificationSettings>('/notifications'),
  })
}

/** The browser's own zone, which is the only place the server can learn it. */
function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'
}

/**
 * Registers a browser subscription server-side, then flips the master switch.
 *
 * The browser half — permission, then `pushManager.subscribe` — deliberately
 * does *not* happen here: it has to be started straight from the tap, and
 * react-query awaits before it ever calls a `mutationFn`, which is long enough
 * for Safari to consider the gesture over and drop the prompt without a word.
 * So the caller subscribes and hands the result in. See lib/push.ts.
 *
 * Order still matters on this side. Flipping the switch first would leave an
 * account marked as wanting reminders with no device to send them to, which is
 * indistinguishable from a broken scheduler.
 */
export function useEnableNotifications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (subscription: PushSubscriptionPayload) => {
      await api('/notifications/subscribe', {
        method: 'POST',
        body: { ...subscription, userAgent: navigator.userAgent },
      })
      return api<{ enabled: boolean; timezone: string }>('/notifications', {
        method: 'PATCH',
        body: { enabled: true, timezone: browserTimezone() },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

/**
 * Turns them off and unregisters this browser, rather than only flipping the
 * flag: a subscription left behind is a device that starts getting reminders
 * again the moment anything re-enables them.
 */
export function useDisableNotifications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribeFromPush()
      if (endpoint) {
        await api('/notifications/subscribe', {
          method: 'DELETE',
          body: { endpoint },
        }).catch(() => {})
      }
      return api('/notifications', {
        method: 'PATCH',
        body: { enabled: false },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

/**
 * Settings that need no permission dance: right now that is the timezone, which
 * the app offers to correct when the phone has travelled.
 */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { timezone?: string; enabled?: boolean }) =>
      api<{ enabled: boolean; timezone: string }>('/notifications', {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

export { browserTimezone }

/**
 * Re-registers this browser when the account wants reminders but this device is
 * not subscribed — a browser may drop a subscription on its own, and the only
 * symptom is silence. Cheap enough to run every time the screen is opened.
 */
export function useRepairSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (publicKey: string) => {
      if (!pushSupported() || pushPermission() !== 'granted') return false
      if (await currentSubscription()) return false
      const subscription = await subscribeToPush(publicKey)
      await api('/notifications/subscribe', {
        method: 'POST',
        body: { ...subscription, userAgent: navigator.userAgent },
      })
      return true
    },
    onSuccess: (repaired) => {
      if (repaired) {
        void queryClient.invalidateQueries({ queryKey: notificationKey })
      }
    },
    // A repair that cannot run is not an error the user asked for.
    onError: () => {},
  })
}

export interface ReminderInput {
  kind: ReminderKind
  meal?: Meal | null
  label: string
  atMinutes: number
  weekdays?: number[]
  skipIfLogged?: boolean
}

export function useCreateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ReminderInput) =>
      api<Reminder>('/notifications/reminders', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

export function useUpdateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<
      Pick<
        Reminder,
        'label' | 'atMinutes' | 'weekdays' | 'skipIfLogged' | 'enabled'
      >
    >) =>
      api<Reminder>(`/notifications/reminders/${id}`, {
        method: 'PATCH',
        body,
      }),
    onMutate: async ({ id, ...patch }) => {
      // The switches and day pills have to answer instantly; a round trip per
      // tap would make a row feel stuck.
      await queryClient.cancelQueries({ queryKey: notificationKey })
      const previous =
        queryClient.getQueryData<NotificationSettings>(notificationKey)
      queryClient.setQueryData<NotificationSettings>(
        notificationKey,
        (current) =>
          current && {
            ...current,
            reminders: current.reminders.map((reminder) =>
              reminder.id === id ? { ...reminder, ...patch } : reminder,
            ),
          },
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

export function useDeleteReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/reminders/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKey })
      const previous =
        queryClient.getQueryData<NotificationSettings>(notificationKey)
      queryClient.setQueryData<NotificationSettings>(
        notificationKey,
        (current) =>
          current && {
            ...current,
            reminders: current.reminders.filter((r) => r.id !== id),
          },
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKey, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

/** Creates the whole suggested set, skipping what the user already has. */
export function useApplyDefaultReminders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ created: number; reminders: Reminder[] }>(
        '/notifications/reminders/defaults',
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
    },
  })
}

export function useTestNotification() {
  return useMutation({
    mutationFn: () =>
      api<{ sent: number }>('/notifications/test', { method: 'POST' }),
  })
}

/** Italian copy for the reasons a subscription attempt can fail. */
export function pushErrorMessage(error: unknown) {
  if (!(error instanceof PushError)) {
    return 'Non è stato possibile attivare le notifiche. Riprova.'
  }
  switch (error.code) {
    case 'unsupported':
      return 'Questo browser non supporta le notifiche push.'
    case 'denied':
      return 'Le notifiche sono bloccate. Riattivale dalle impostazioni del browser per questo sito.'
    case 'dismissed':
      return 'Permesso non concesso. Riprova e scegli “Consenti” nella richiesta del browser.'
    case 'needs_install':
      return 'Su iPhone e iPad aggiungi prima Calorico alla schermata Home: Safari consegna le notifiche solo all’app installata.'
    case 'no_service_worker':
      return 'Le notifiche non sono disponibili in questa versione dell’app.'
    default:
      return 'Non è stato possibile attivare le notifiche. Riprova.'
  }
}
