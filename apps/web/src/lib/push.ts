/**
 * The browser half of push notifications.
 *
 * Everything here can fail for reasons that are not bugs — an unsupported
 * browser, a denied permission, an iPhone that has not installed the app — so
 * every failure is a named code the settings screen can explain, never a thrown
 * Error with a message nobody reads.
 *
 * Two rules shape the whole file, both of them iOS's.
 *
 * **The permission prompt must be asked straight out of the tap.** Safari only
 * shows it while the user gesture is still live, and it does not report the
 * difference — a request made one await too late resolves to 'default' with no
 * prompt ever drawn, which looks exactly like a broken app. So `subscribeToPush`
 * asks for permission as its first statement and the caller must call it
 * directly from the event handler, never from inside something that awaits first
 * (a react-query `mutationFn` does). Everything that runs on its own — a repair
 * on page load — goes through `resubscribeToPush`, which can never prompt.
 *
 * **On iOS the push subscription _is_ the permission.** WebKit stores the two
 * together for an installed web app: drop the subscription and the app is back
 * to "not asked", so the next time reminders are turned on the system prompt
 * appears again. That is why turning notifications off leaves the iOS
 * subscription alone (see `unsubscribeFromPush`) and why nothing here
 * re-subscribes unless it has to.
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
  /** The server's VAPID public key is not something a browser can decode. */
  | 'bad_key'
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

  // Past this line a prompt is genuinely drawn, so this is the one place that can
  // count them. See countPrompt.
  countPrompt()

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

/** How long to wait for a worker to finish installing. */
const SW_WAIT_MS = 8_000

/** The generated worker, same URL initPwa registers. See lib/pwa.ts. */
const SW_URL = '/sw.js'

/**
 * The registration, with an active worker — registered here if there is none.
 *
 * Waiting for a worker to appear is not enough. iOS discards the service worker
 * registration of a home-screen app that has not been opened for a while, and an
 * app opened after a week has none until something registers it again: a tap that
 * only waits reports "notifications are not available in this version", which is
 * both wrong and a dead end. So this registers on the spot. initPwa does it on
 * load as well; `register` on an existing registration is a no-op, so the two
 * cannot fight.
 *
 * Then it waits for a worker to be *active*, because `pushManager` answers from
 * the worker: on a cold start it reports no subscription while the worker is
 * still coming up, and believing that answer is what makes an app subscribe all
 * over again.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new PushError('no_service_worker')

  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing?.active) return existing

  let reg = existing ?? null
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    } catch (err) {
      // Offline on a first run, a deploy that never shipped the worker, or an
      // install that rejected — a precached URL that 404s does exactly that, and
      // it is invisible unless it is written down.
      rememberPushFailure('sw-register', err)
      throw new PushError('no_service_worker')
    }
  }

  if (await waitForActive(reg)) return reg
  // Registered, but nothing has taken charge in time. Worth returning rather than
  // refusing: pushManager fails with a reason of its own, and the alternative is
  // blaming a build that is fine.
  return reg
}

/** Whether a worker reached 'activated' for this registration, in time. */
async function waitForActive(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (reg.active) return true

  const pending = reg.installing ?? reg.waiting

  return await Promise.race([
    // Resolves once *some* worker controls this scope, which is the real answer.
    navigator.serviceWorker.ready.then(() => true),
    new Promise<boolean>((resolve) => {
      if (!pending) return
      pending.addEventListener('statechange', () => {
        if (pending.state === 'activated') resolve(true)
        // This candidate died; there is nothing left to wait for.
        if (pending.state === 'redundant') resolve(false)
      })
    }),
    new Promise<boolean>((resolve) => {
      window.setTimeout(() => resolve(false), SW_WAIT_MS)
    }),
  ])
}

/** Extra looks at `getSubscription()` before believing a `null`. */
const SUBSCRIPTION_ATTEMPTS = 3
const SUBSCRIPTION_RETRY_MS = 250

/**
 * This browser's subscription, or null.
 *
 * The retries are for WebKit: an installed iOS app that has just been launched
 * can answer `null` for a subscription it still holds, and every caller here
 * reads that as "this device is not registered" — one of them then subscribes
 * again, which is a brand new endpoint, a dead row on the server, and on iOS a
 * permission prompt the user has already answered. A few hundred milliseconds
 * of patience is the whole fix.
 */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null

  let reg: ServiceWorkerRegistration
  try {
    reg = await registration()
  } catch {
    return null
  }

  try {
    return await patientSubscription(reg)
  } catch {
    return null
  }
}

/**
 * `getSubscription()`, asked more than once before its `null` is believed.
 *
 * Every caller that acts on a missing subscription goes through here. Asking the
 * registration directly is the mistake this exists to prevent: one cold-start
 * `null` taken at face value is a second endpoint, a device row the server can
 * never reach, and on iOS a permission the app has to ask for all over again.
 */
async function patientSubscription(reg: ServiceWorkerRegistration) {
  for (let attempt = 1; ; attempt += 1) {
    const found = await reg.pushManager.getSubscription()
    if (found) return found
    if (attempt >= SUBSCRIPTION_ATTEMPTS) return null
    await new Promise((resolve) => {
      window.setTimeout(resolve, SUBSCRIPTION_RETRY_MS * attempt)
    })
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

  // An app that was already allowed may be holding a subscription it has not
  // admitted to yet; one that is being allowed right now cannot be.
  const held = pushPermission() === 'granted'

  // First statement that touches the platform, and nothing is awaited before
  // it: the gesture that called us is still live here and nowhere later.
  const permission = await requestPushPermission()
  if (permission === 'denied') throw new PushError('denied')
  if (permission !== 'granted') throw new PushError('dismissed')

  return ensureSubscription(publicKey, held)
}

/**
 * The same thing, for code that no tap is waiting on.
 *
 * Runs on page load to put a device back on the list after the browser quietly
 * dropped its subscription. Two things make it different from `subscribeToPush`:
 * it never asks for permission, so it cannot draw a prompt out of nowhere, and
 * it answers null instead of throwing — iOS refuses to subscribe outside a
 * gesture, and that refusal is a normal outcome here, not an error worth a
 * message.
 */
export async function resubscribeToPush(
  publicKey: string,
): Promise<PushSubscriptionPayload | null> {
  if (needsInstallFirst() || !pushSupported()) return null
  if (pushPermission() !== 'granted') return null

  try {
    return await ensureSubscription(publicKey, true)
  } catch {
    return null
  }
}

/**
 * Reuses the subscription this browser already holds, and only makes a new one
 * when there is none. Assumes permission is settled — its callers do that part.
 *
 * `mayHold` says whether a subscription could plausibly exist, and buys it the
 * patient lookup. It is false for exactly one case — a permission granted a
 * moment ago, which cannot have a subscription behind it yet — where waiting
 * would only make the first tap feel slow.
 */
async function ensureSubscription(
  publicKey: string,
  mayHold: boolean,
): Promise<PushSubscriptionPayload> {
  const reg = await registration()

  let key: Uint8Array<ArrayBuffer>
  try {
    key = urlBase64ToUint8Array(publicKey)
  } catch (err) {
    // A key the browser cannot decode used to surface as an unnamed exception,
    // which read to the user as "try again" — advice that could never work.
    rememberPushFailure('key', err)
    throw new PushError('bad_key')
  }

  const existing = mayHold
    ? await patientSubscription(reg)
    : await reg.pushManager.getSubscription()
  if (existing) {
    if (sameKey(existing, key)) return toPayload(existing)
    // A subscription signed with a rotated key can never be delivered to, so it
    // is dropped rather than reported — on iOS at the cost of the permission,
    // which is still better than a device that is silent for good.
    await existing.unsubscribe().catch(() => {})
  }

  try {
    const fresh = await subscribeOnce(reg, key)
    const payload = toPayload(fresh)
    clearPushFailure()
    return payload
  } catch (err) {
    if (err instanceof PushError) throw err
    rememberPushFailure('subscribe', err)
    if ((err as Error)?.name === 'NotAllowedError') throw new PushError('denied')
    throw new PushError('failed')
  }
}

/**
 * Subscribes, and clears a subscription that is standing in the way.
 *
 * `InvalidStateError` means the browser already holds one made with a different
 * key — normally dropped above, but `unsubscribe()` is allowed to fail and it is
 * ignored when it does, which leaves the tap failing forever with a message that
 * says to try again. Dropping it here and retrying once is the only way out that
 * does not need the user to reinstall the app.
 */
async function subscribeOnce(
  reg: ServiceWorkerRegistration,
  key: Uint8Array<ArrayBuffer>,
) {
  const options: PushSubscriptionOptionsInit = {
    // Chrome refuses anything else; Safari ignores it. Every push we send is a
    // visible notification anyway.
    userVisibleOnly: true,
    applicationServerKey: key,
  }

  try {
    return await reg.pushManager.subscribe(options)
  } catch (err) {
    if ((err as Error)?.name !== 'InvalidStateError') throw err
    rememberPushFailure('subscribe-retry', err)
    const stuck = await reg.pushManager.getSubscription()
    if (!stuck) throw err
    await stuck.unsubscribe()
    return await reg.pushManager.subscribe(options)
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

/**
 * Gives up this browser's registration. Returns the endpoint to unregister
 * server-side, which is the half that always happens.
 *
 * On iOS the local subscription is deliberately left alive. WebKit keeps the
 * permission and the subscription as one thing for an installed web app, so
 * dropping it here would send the app back to "never asked" — and the user who
 * turns reminders off in the evening and on again the next morning would be
 * answering the system prompt every time. Nothing is delivered either way once
 * the server has forgotten the endpoint.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return rememberedEndpoint()
  const { endpoint } = subscription
  if (!isIos()) await subscription.unsubscribe().catch(() => {})
  return endpoint
}

/** Where the endpoint last handed to the server is remembered. */
const ENDPOINT_KEY = 'calorico.push.endpoint'

/**
 * The endpoint this browser last registered, as far as it knows.
 *
 * The browser can hand out a new endpoint for the same device — iOS does it
 * after some restarts — and the old one stays on the server as a device the
 * scheduler keeps trying and never reaches. Remembering it locally is the only
 * way to know which row to take out.
 */
export function rememberedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY)
  } catch {
    // Private mode, or storage the user has blocked: the app still works, it
    // just cannot clean up after a rotated endpoint.
    return null
  }
}

export function rememberEndpoint(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint)
    else localStorage.removeItem(ENDPOINT_KEY)
  } catch {
    // Nothing to do; see rememberedEndpoint.
  }
}

/** The last thing that went wrong, kept for the settings screen to show. */
const LAST_ERROR_KEY = 'calorico.push.lastError'

export interface PushFailureNote {
  /** Which step failed: registering the worker, subscribing, reading the keys. */
  stage: string
  /** The browser's own name for it — AbortError, InvalidStateError, … */
  name: string
  message: string
  at: string
}

/**
 * Records what the platform actually said.
 *
 * Every failure here reaches the user as one of a handful of sentences, which is
 * right for a settings screen and useless for working out why an iPhone will not
 * subscribe: "could not enable notifications" covers a push service that refused,
 * a subscription stuck in the way, and a key that will not decode. There is no
 * console on a phone, so the last one is kept and put on screen.
 */
export function rememberPushFailure(stage: string, error: unknown) {
  const err = error as Error | undefined
  try {
    localStorage.setItem(
      LAST_ERROR_KEY,
      JSON.stringify({
        stage,
        name: err?.name || 'Error',
        message: (err?.message || String(error)).slice(0, 160),
        at: new Date().toISOString(),
      } satisfies PushFailureNote),
    )
  } catch {
    // Diagnostics must never be the reason an error goes unreported to the user.
  }
}

export function lastPushFailure(): PushFailureNote | null {
  try {
    const raw = localStorage.getItem(LAST_ERROR_KEY)
    return raw ? (JSON.parse(raw) as PushFailureNote) : null
  } catch {
    return null
  }
}

/** Dropped once the thing that was failing works, so stale errors do not mislead. */
function clearPushFailure() {
  try {
    localStorage.removeItem(LAST_ERROR_KEY)
  } catch {
    // See rememberPushFailure.
  }
}

/** How many system prompts this device has been shown, and when the last was. */
const PROMPT_COUNT_KEY = 'calorico.push.prompts'
const PROMPT_LAST_KEY = 'calorico.push.prompts.last'

/**
 * Records that the system prompt was drawn.
 *
 * "It asks again every time" is a claim about a whole life of the app — launches,
 * force-quits, a switch turned off in the evening and on in the morning — and no
 * test on a laptop can settle it for an iPhone. So the device keeps the count
 * itself: one is a permission asked once and honoured ever since, and anything
 * climbing is the bug, on the hardware, in a number rather than an impression.
 *
 * Counted here rather than at the call sites because this is the only line in the
 * app past which a prompt is certain: every earlier return answers from a
 * permission that was already settled.
 */
function countPrompt() {
  try {
    const next = promptsDrawn() + 1
    localStorage.setItem(PROMPT_COUNT_KEY, String(next))
    localStorage.setItem(PROMPT_LAST_KEY, new Date().toISOString())
  } catch {
    // Counting is diagnostics; it must never be the reason a prompt is not shown.
  }
}

/**
 * How many times this device has been shown the prompt since the count began.
 *
 * It starts at zero on a build that has this counter, so it measures from the
 * fix onwards — which is the window anyone is asking about — and not the
 * permissions a phone answered last year.
 */
export function promptsDrawn(): number {
  try {
    const raw = Number(localStorage.getItem(PROMPT_COUNT_KEY))
    return Number.isInteger(raw) && raw > 0 ? raw : 0
  } catch {
    return 0
  }
}

/** When the last prompt was drawn, for telling "once, ages ago" from "just now". */
export function lastPromptAt(): string | null {
  try {
    return localStorage.getItem(PROMPT_LAST_KEY)
  } catch {
    return null
  }
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
  /**
   * Which worker the registration actually has, since "registered" and "able to
   * receive a push" are not the same state: only an active one answers, and iOS
   * discards the registration of an app left unopened, so this is the difference
   * between a worker coming up and one that is not there at all.
   */
  serviceWorkerState: 'active' | 'installing' | 'waiting' | 'none'
  notificationApi: boolean
  pushApi: boolean
  permission: NotificationPermission
  /** This browser holds a push subscription right now. */
  subscribed: boolean
  /**
   * The tail of the endpoint this browser holds, and whether it is still the one
   * the server was given.
   *
   * These two are how the churn that iOS is prone to becomes visible on a phone:
   * an endpoint that reads differently after a force-quit, or one that no longer
   * matches what was registered, is a device the reminders are being sent to and
   * no longer arrive at.
   */
  endpointTail: string | null
  endpointStable: boolean
  /**
   * How many times this device has been shown the system prompt, and when the
   * last one was. The answer to "does it ask again every time", read off the
   * phone rather than inferred.
   */
  promptsDrawn: number
  lastPromptAt: string | null
  /** What the platform last refused, in its own words. Null once it worked. */
  lastFailure: PushFailureNote | null
}

export async function pushDiagnostics(): Promise<PushDiagnostics> {
  const hasServiceWorker =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator

  let registered = false
  let state: PushDiagnostics['serviceWorkerState'] = 'none'
  if (hasServiceWorker) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      registered = Boolean(reg)
      if (reg?.active) state = 'active'
      else if (reg?.installing) state = 'installing'
      else if (reg?.waiting) state = 'waiting'
    } catch {
      registered = false
    }
  }

  const subscription = await currentSubscription()
  const remembered = rememberedEndpoint()

  return {
    ios: isIos(),
    standalone: isStandalone(),
    serviceWorker: registered,
    serviceWorkerState: state,
    notificationApi: 'Notification' in window,
    pushApi: 'PushManager' in window,
    permission: pushPermission(),
    subscribed: Boolean(subscription),
    endpointTail: subscription ? subscription.endpoint.slice(-10) : null,
    // Nothing registered yet is not a mismatch; a mismatch is an endpoint that
    // moved out from under a registration.
    endpointStable: !subscription || !remembered
      ? true
      : subscription.endpoint === remembered,
    promptsDrawn: promptsDrawn(),
    lastPromptAt: lastPromptAt(),
    lastFailure: lastPushFailure(),
  }
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) {
    // A subscription without keys cannot be encrypted to, so it is worse than
    // none: the server would hold a device every send fails against.
    rememberPushFailure('payload', new Error('subscription has no encryption keys'))
    throw new PushError('failed')
  }
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

/**
 * VAPID keys travel as base64url; PushManager wants the raw bytes.
 *
 * Backed by an explicit ArrayBuffer: `PushSubscriptionOptionsInit` accepts an
 * `ArrayBufferView<ArrayBuffer>`, and a bare `new Uint8Array(n)` is typed over
 * `ArrayBufferLike`, which includes SharedArrayBuffer and so does not fit.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
