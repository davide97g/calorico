/**
 * The browser half of push notifications.
 *
 * Everything here can fail for reasons that are not bugs — an unsupported
 * browser, a denied permission, an iPhone that has not installed the app — so
 * every failure is a named code the settings screen can explain, never a thrown
 * Error with a message nobody reads.
 */

export type PushFailure =
  /** No service worker, no PushManager: an old or embedded browser. */
  | 'unsupported'
  /** The user said no. Only they can undo it, from browser settings. */
  | 'denied'
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
 * The one hard platform rule worth pre-empting: Safari on iOS exposes
 * PushManager in a normal tab but only ever delivers to an installed app, and
 * asking for permission there burns the prompt for nothing.
 */
export function needsInstallFirst() {
  return isIos() && !isStandalone()
}

/**
 * `navigator.serviceWorker.ready` never resolves when no worker was ever
 * registered — which is exactly the dev build, where vite-plugin-pwa is off. So
 * ask for the registration instead and report the absence.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!existing) throw new PushError('no_service_worker')
  return existing
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
 */
export async function subscribeToPush(
  publicKey: string,
): Promise<PushSubscriptionPayload> {
  if (!pushSupported()) throw new PushError('unsupported')
  if (needsInstallFirst()) throw new PushError('needs_install')

  // Must be called from a user gesture; the settings switch is one.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushError('denied')

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

/** Drops this browser's subscription. Returns the endpoint that was removed. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe().catch(() => {})
  return endpoint
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
  if (!current) return false
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
