/**
 * The browser half of push notifications.
 *
 * Everything here can fail for reasons that are not bugs — an unsupported
 * browser, a denied permission, an iPhone that has not installed the app — so
 * every failure is a named code the settings screen can explain, never a thrown
 * Error with a message nobody reads.
 *
 * One rule shapes the whole file: **the permission prompt must be asked
 * straight out of the tap**. Safari only shows it while the user gesture is
 * still live, and it does not report the difference — a request made one await
 * too late resolves to 'default' with no prompt ever drawn, which looks exactly
 * like a broken app. So `subscribeToPush` asks for permission as its first
 * statement and the caller must call it directly from the event handler, never
 * from inside something that awaits first (a react-query `mutationFn` does).
 */

export type PushFailure =
  /** No service worker, no PushManager: an old or embedded browser. */
  | 'unsupported'
  /** The user said no. Only they can undo it, from browser settings. */
  | 'denied'
  /** The prompt was closed, or never appeared, without an answer. */
  | 'dismissed'
  /** iOS only delivers push to a PWA added to the home screen. */
  | 'needs_install'
  /** No worker registered — dev builds, where the PWA plugin is switched off. */
  | 'no_service_worker'
  | 'failed'

export class PushError extends Error {
  code: PushFailure

  constructor(code: PushFailure) {
    super(code)
    this.code = code
  }
}

/** Shape the API expects; matches PushSubscription.toJSON(). */
export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

export function isIos() {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; the touch points give it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** True in an installed PWA, which is iOS's precondition for push. */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * The one hard platform rule worth pre-empting: Safari on iOS does not even
 * define Notification in a normal tab, and the one that does — an installed
 * home-screen app — is the only place a push is ever delivered. Asking anything
 * else of a browser that has not been installed yet is pointless.
 */
export function needsInstallFirst() {
  return isIos() && !isStandalone()
}

/**
 * Asks the browser for permission.
 *
 * Must be called synchronously from a user gesture — see the note at the top of
 * the file. Never rejects: a browser with no Notification API, and a prompt the
 * user dismissed, are both answers the settings screen knows how to explain.
 *
 * Safari once only had the callback form and Chrome only has the promise one, so
 * both are wired up and whichever answers first wins.
 */
export function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied')
  // Already answered: asking again draws nothing and, on iOS, a second call
  // after a refusal is silently ignored.
  if (Notification.permission !== 'default') {
    return Promise.resolve(Notification.permission)
  }

  return new Promise((resolve) => {
    let settled = false
    const done = (permission: NotificationPermission) => {
      if (settled) return
      settled = true
      resolve(permission)
    }

    try {
      const result = Notification.requestPermission(done)
      if (result && typeof result.then === 'function') {
        result.then(done, () => done(Notification.permission))
      }
    } catch {
      done(Notification.permission)
    }
  })
}

/** How long to wait for a worker that is still installing on a first run. */
const SW_WAIT_MS = 5_000

/**
 * The registration, waited for rather than demanded.
 *
 * `navigator.serviceWorker.ready` never resolves when no worker was ever
 * registered — which is exactly the dev build, where vite-plugin-pwa is off. So
 * it is raced against a timeout: that covers the first run, where initPwa
 * registers on load and the user can reach this screen before it finished,
 * without hanging forever where there is nothing to wait for.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing

  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), SW_WAIT_MS)
    }),
  ])

  if (!ready) throw new PushError('no_service_worker')
  return ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * Asks for permission if needed, then subscribes this browser and returns what
 * the API needs. Safe to call when already subscribed: the existing
 * subscription is reused unless it was made with a different VAPID key.
 *
 * Call this from the tap itself. See the note at the top of the file.
 */
export async function subscribeToPush(
  publicKey: string,
): Promise<PushSubscriptionPayload> {
  // Order matters: an iPhone in a Safari tab has no Notification API at all, so
  // asking about support first would blame the browser for a missing install.
  if (needsInstallFirst()) throw new PushError('needs_install')
  if (!pushSupported()) throw new PushError('unsupported')

  // First statement that touches the platform, and nothing is awaited before
  // it: the gesture that called us is still live here and nowhere later.
  const permission = await requestPushPermission()
  if (permission === 'denied') throw new PushError('denied')
  if (permission !== 'granted') throw new PushError('dismissed')

  const reg = await registration()
  const key = urlBase64ToUint8Array(publicKey)

  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    // A subscription signed with a rotated key can never be delivered to, so
    // it is dropped rather than reported.
    if (sameKey(existing, key)) return toPayload(existing)
    await existing.unsubscribe().catch(() => {})
  }

  try {
    const fresh = await reg.pushManager.subscribe({
      // Chrome refuses anything else; Safari ignores it. Every push we send is
      // a visible notification anyway.
      userVisibleOnly: true,
      applicationServerKey: key,
    })
    return toPayload(fresh)
  } catch (err) {
    if ((err as Error)?.name === 'NotAllowedError') throw new PushError('denied')
    throw new PushError('failed')
  }
}

/**
 * Shows a notification from the worker, with no server and no push service in
 * the way.
 *
 * This splits "nothing arrives" in two: if this one appears, the device and the
 * permission are fine and the problem is delivery — keys, subscription, or the
 * scheduler. If it does not, nothing sent from a server ever will either.
 */
export async function showLocalNotification(): Promise<void> {
  if (!pushSupported()) throw new PushError('unsupported')
  if (pushPermission() !== 'granted') throw new PushError('denied')

  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) throw new PushError('no_service_worker')

  await reg.showNotification('Calorico', {
    body: 'Prova locale: questo dispositivo mostra le notifiche.',
    icon: '/icons/icon-192.png',
    badge: '/icons/monochrome-512.png',
    tag: 'calorico-local-test',
  })
}

/** Drops this browser's subscription. Returns the endpoint that was removed. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe().catch(() => {})
  return endpoint
}

/**
 * Everything that has to line up for a notification to arrive, in one object.
 *
 * The settings screen shows this verbatim. On a phone there is no console to
 * open, and "notifications are on but nothing arrives" has half a dozen causes
 * that look identical from the outside — a permission answered months ago, an
 * app opened from Safari instead of the home screen, a worker that never
 * installed. Naming them is the whole point.
 */
export interface PushDiagnostics {
  ios: boolean
  /** Opened as an installed app rather than in a browser tab. */
  standalone: boolean
  /** A worker is registered for the origin, so a push has somewhere to land. */
  serviceWorker: boolean
  notificationApi: boolean
  pushApi: boolean
  permission: NotificationPermission
  /** This browser holds a push subscription right now. */
  subscribed: boolean
}

export async function pushDiagnostics(): Promise<PushDiagnostics> {
  const hasServiceWorker =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator

  let registered = false
  if (hasServiceWorker) {
    try {
      registered = Boolean(await navigator.serviceWorker.getRegistration('/'))
    } catch {
      registered = false
    }
  }

  return {
    ios: isIos(),
    standalone: isStandalone(),
    serviceWorker: registered,
    notificationApi: 'Notification' in window,
    pushApi: 'PushManager' in window,
    permission: pushPermission(),
    subscribed: Boolean(await currentSubscription()),
  }
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) throw new PushError('failed')
  return { endpoint: subscription.endpoint, keys: { p256dh, auth } }
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options.applicationServerKey
  // Not every browser exposes the key it subscribed with. Treating that as a
  // mismatch would tear down and re-create a working subscription on every
  // visit — a new endpoint each time, and a second chance to fail — so an
  // unreadable key is trusted. A key that really did rotate shows up as a push
  // the service rejects, and the server drops that subscription on its own.
  if (!current) return true
  const a = new Uint8Array(current)
  return a.length === key.length && a.every((byte, i) => byte === key[i])
}

/** VAPID keys travel as base64url; PushManager wants the raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
