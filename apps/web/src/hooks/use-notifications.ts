import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { BUILD_ID } from '@/lib/build'
import {
  PushError,
  rememberEndpoint,
  rememberedEndpoint,
  resubscribeToPush,
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

export function useNotificationSettings({ enabled = true } = {}) {
  return useQuery({
    queryKey: notificationKey,
    queryFn: () => api<NotificationSettings>('/notifications'),
    enabled,
  })
}

/** The browser's own zone, which is the only place the server can learn it. */
function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'
}

/**
 * Hands a subscription to the server, and takes the one it replaces out.
 *
 * The endpoint is remembered locally afterwards because the browser can hand out
 * a different one for the same device — iOS does it after some restarts — and
 * the row behind the old endpoint would stay on the account as a device the
 * scheduler tries forever and never reaches. The delete is best-effort: it is
 * housekeeping, and failing it must not stop this device from registering.
 */
async function registerDevice(subscription: PushSubscriptionPayload) {
  const previous = rememberedEndpoint()
  if (previous && previous !== subscription.endpoint) {
    await api('/notifications/subscribe', {
      method: 'DELETE',
      body: { endpoint: previous },
    }).catch(() => {})
  }

  const result = await api<{ devices: number }>('/notifications/subscribe', {
    method: 'POST',
    body: {
      ...subscription,
      userAgent: navigator.userAgent,
      buildId: BUILD_ID,
    },
  })

  rememberEndpoint(subscription.endpoint)
  return result
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
      await registerDevice(subscription)
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
 * flag: a subscription left behind on the server is a device that starts getting
 * reminders again the moment anything re-enables them.
 *
 * The browser's own subscription survives on iOS, where it is the permission —
 * see `unsubscribeFromPush`. Turning reminders back on then costs a tap and no
 * prompt.
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
      rememberEndpoint(null)
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
 * Takes this device off the account it is signed in to.
 *
 * Called on sign-out, while the token is still good: the endpoint belongs to the
 * browser, not to the account, so a row left behind would send the next person to
 * use this phone the previous one's reminders. The browser's own subscription is
 * left alone — on iOS it is the permission (see push.ts), and the next account to
 * sign in here reuses it without a prompt.
 */
export async function unregisterDevice() {
  const endpoint = rememberedEndpoint()
  rememberEndpoint(null)
  if (!endpoint) return
  await api('/notifications/subscribe', {
    method: 'DELETE',
    body: { endpoint },
  }).catch(() => {})
}

/**
 * Which account this device has already synced for in this page session.
 *
 * One sync per account is enough, and the flag lives outside the hook so
 * StrictMode's double effect and a re-render cannot turn it into two requests.
 * Keyed by user rather than a bare boolean: signing out and in as somebody else
 * never reloads the page, and that second account has a device list of its own.
 */
let syncedFor: string | null = null

/**
 * Keeps this device on the account's list, once per session, from anywhere in the
 * app.
 *
 * Two jobs, and they need the same subscription, so they are one request.
 *
 * It re-registers a device that has fallen off — the browser dropped its
 * subscription, or handed out a new endpoint — which used to be repaired only by
 * opening the reminders screen. Nobody opens a settings screen to find out why
 * nothing is arriving; they conclude the app is broken. And it reports the build
 * this device runs, which is what keeps the release notification honest: the
 * server only pushes "new version" to subscriptions whose last reported build is
 * not the deployed one, so a phone that already updated itself in the background
 * is not told about it.
 *
 * Nothing here can ask for permission — `resubscribeToPush` is the silent
 * variant — so a session that starts with the permission never granted, or
 * revoked by iOS, does nothing at all and leaves the tap on the reminders screen
 * to do the asking.
 */
export function useSyncDevice(userId: string | null) {
  const queryClient = useQueryClient()
  const settings = useNotificationSettings({ enabled: Boolean(userId) })
  const armed = Boolean(settings.data?.enabled)
  const publicKey = settings.data?.push.publicKey ?? null
  const knownDevices = settings.data?.devices

  useEffect(() => {
    if (!userId || !armed || !publicKey) return
    if (syncedFor === userId) return
    syncedFor = userId

    void (async () => {
      const subscription = await resubscribeToPush(publicKey)
      // No subscription and no way to make one unattended: there is nothing to
      // register the build against either.
      if (!subscription) return
      // Failures are ignored: the next session tries again, and the worst case is
      // one notification this device did not need.
      const result = await registerDevice(subscription).catch(() => null)
      // Only when the list actually moved — a settings screen open right now has
      // to stop saying this device is missing, and every other session has no
      // news worth a second request.
      if (result && result.devices !== knownDevices) {
        void queryClient.invalidateQueries({ queryKey: notificationKey })
      }
    })()
  }, [userId, armed, publicKey, knownDevices, queryClient])
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
