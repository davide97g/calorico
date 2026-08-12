import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentSubscription,
  promptsDrawn,
  rememberEndpoint,
  rememberedEndpoint,
  resubscribeToPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'

/**
 * The iPhone sequence, run against a browser that behaves like WebKit does.
 *
 * The unit tests next door check each function on its own. This file checks the
 * thing the user actually reported: a permission prompt on every launch and every
 * time reminders are switched back on. That is a property of the whole sequence —
 * grant, relaunch, off, on, relaunch — so the sequence is what is run here,
 * against a fake that reproduces the two WebKit rules the code is written for:
 *
 *  1. The permission and the push subscription are one thing. `unsubscribe()`
 *     sends the web app back to 'default', which is what makes the system prompt
 *     appear again.
 *  2. A freshly launched app answers `getSubscription() → null` for a
 *     subscription it still holds, until its worker is up.
 *
 * Both rules are asserted against the fake itself first (`the fake`), so a test
 * that passes because the fake got lenient is a test that fails here.
 */

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

const PUBLIC_KEY = 'BNc7l1UJ8jRk8Yl7hRQ3cUuWjHTr5wZq0Yt2pKmXeCg'

/** How many null answers a cold start gives before admitting the truth. */
const COLD_START_LIES = 2

function installedIphone() {
  let permission: NotificationPermission = 'default'
  let subscription: FakePushSubscription | null = null
  let endpointsIssued = 0
  /** Counts down the spurious nulls a freshly started worker answers with. */
  let coldStartLies = 0
  let workerActive = true

  const requestPermission = vi.fn(async () => {
    // The prompt. Every call here is a prompt the user has to answer.
    permission = 'granted'
    notification.permission = permission
    return permission
  })

  interface FakePushSubscription {
    endpoint: string
    options: { applicationServerKey: null }
    unsubscribe: () => Promise<boolean>
    toJSON: () => { keys: { p256dh: string; auth: string } }
  }

  const makeSubscription = (): FakePushSubscription => {
    endpointsIssued += 1
    return {
      endpoint: `https://push.apple.example/${endpointsIssued}`,
      options: { applicationServerKey: null },
      unsubscribe: async () => {
        subscription = null
        // Rule 1: WebKit keeps the two together for an installed web app.
        permission = 'default'
        notification.permission = permission
        return true
      },
      toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
    }
  }

  const getSubscription = vi.fn(async () => {
    // Rule 2: the worker is up but not talking yet.
    if (coldStartLies > 0) {
      coldStartLies -= 1
      return null
    }
    return subscription
  })

  const subscribe = vi.fn(async () => {
    if (permission !== 'granted') {
      throw Object.assign(new Error('permission'), { name: 'NotAllowedError' })
    }
    subscription = makeSubscription()
    return subscription
  })

  const registration = {
    get active() {
      return workerActive ? {} : null
    },
    pushManager: { getSubscription, subscribe },
  }

  const notification = {
    permission,
    requestPermission,
  } as { permission: NotificationPermission; requestPermission: typeof requestPermission }

  const navigatorStub = {
    userAgent: IOS_UA,
    platform: 'iPhone',
    maxTouchPoints: 5,
    // Launched from the home screen, which is the only place iOS delivers push.
    standalone: true,
    serviceWorker: {
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  }

  const store = new Map<string, string>()

  const define = (name: string, value: unknown) => {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    })
  }

  define('navigator', navigatorStub)
  define('Notification', notification)
  define('window', {
    Notification: notification,
    PushManager: class {},
    // Immediate, so a retry backoff does not make the suite wait on it.
    setTimeout: (fn: () => void) => globalThis.setTimeout(fn, 0),
    matchMedia: () => ({ matches: false }),
  })
  define('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })

  return {
    /** Force-quit and reopen: same permission, same subscription, cold worker. */
    relaunch() {
      coldStartLies = COLD_START_LIES
      workerActive = true
      getSubscription.mockClear()
    },
    /** How many times the user has been shown the system prompt. */
    prompts: () => requestPermission.mock.calls.length,
    permission: () => permission,
    subscribed: () => subscription !== null,
    endpointsIssued: () => endpointsIssued,
    dropSubscription: async () => {
      await subscription?.unsubscribe()
    },
  }
}

afterEach(() => {
  for (const name of ['navigator', 'window', 'Notification', 'localStorage']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('the fake iPhone', () => {
  it('loses the permission with the subscription, as WebKit does', async () => {
    const phone = installedIphone()

    await subscribeToPush(PUBLIC_KEY)
    expect(phone.permission()).toBe('granted')

    await phone.dropSubscription()

    expect(phone.permission()).toBe('default')
    expect(phone.subscribed()).toBe(false)
  })

  it('answers null for a subscription it holds, right after a launch', async () => {
    const phone = installedIphone()
    await subscribeToPush(PUBLIC_KEY)

    phone.relaunch()

    // Straight off the registration, with none of this file's patience.
    const raw = await (
      await navigator.serviceWorker.getRegistration('/')
    )?.pushManager.getSubscription()
    expect(raw).toBeNull()
    expect(phone.subscribed()).toBe(true)
  })
})

describe('an installed iPhone, over a whole life of the app', () => {
  it('asks for permission once and never again', async () => {
    const phone = installedIphone()

    // 1. The tap that turns reminders on. The one prompt there should ever be.
    const first = await subscribeToPush(PUBLIC_KEY)
    expect(phone.prompts()).toBe(1)
    rememberEndpoint(first.endpoint)

    // 2. Force-quit, reopen. The app syncs this device in the background.
    phone.relaunch()
    const afterRelaunch = await resubscribeToPush(PUBLIC_KEY)
    expect(afterRelaunch?.endpoint).toBe(first.endpoint)
    expect(phone.prompts()).toBe(1)

    // 3. Reminders off. Only the server-side registration goes.
    const removed = await unsubscribeFromPush()
    expect(removed).toBe(first.endpoint)
    expect(phone.permission()).toBe('granted')
    rememberEndpoint(null)

    // 4. Reminders on again, the next morning. A tap, and no prompt.
    const second = await subscribeToPush(PUBLIC_KEY)
    expect(second.endpoint).toBe(first.endpoint)
    expect(phone.prompts()).toBe(1)
    rememberEndpoint(second.endpoint)

    // 5. Force-quit and reopen twice more, for good measure.
    for (const _ of [0, 1]) {
      phone.relaunch()
      const again = await resubscribeToPush(PUBLIC_KEY)
      expect(again?.endpoint).toBe(first.endpoint)
    }

    expect(phone.prompts()).toBe(1)
    // One endpoint for the whole sequence: the server never collected a device
    // it can no longer reach.
    expect(phone.endpointsIssued()).toBe(1)
    expect(rememberedEndpoint()).toBe(first.endpoint)
    // And the count the phone shows in Diagnostica agrees with the browser: this
    // is the number the user reads to settle it on their own hardware.
    expect(promptsDrawn()).toBe(1)
  })

  it('reports the same device to the server on every launch', async () => {
    const phone = installedIphone()
    const first = await subscribeToPush(PUBLIC_KEY)
    rememberEndpoint(first.endpoint)

    const seen = new Set<string>()
    for (const _ of [0, 1, 2, 3, 4]) {
      phone.relaunch()
      const found = await currentSubscription()
      expect(found).not.toBeNull()
      seen.add(found!.endpoint)
    }

    expect([...seen]).toEqual([first.endpoint])
    expect(phone.prompts()).toBe(1)
  })

  it('needs one tap, and prompts once, after iOS revokes the permission', async () => {
    const phone = installedIphone()
    await subscribeToPush(PUBLIC_KEY)

    // The one case left: iOS itself threw the subscription away. Nothing running
    // unattended may prompt for it, and the tap that does must ask exactly once.
    await phone.dropSubscription()
    phone.relaunch()

    expect(await resubscribeToPush(PUBLIC_KEY)).toBeNull()
    expect(phone.prompts()).toBe(1)

    const repaired = await subscribeToPush(PUBLIC_KEY)

    expect(repaired.endpoint).toBeTruthy()
    expect(phone.prompts()).toBe(2)
    expect(phone.permission()).toBe('granted')
  })
})

describe('the count the phone reports', () => {
  it('counts a prompt only when one is really drawn', async () => {
    const phone = installedIphone()

    await subscribeToPush(PUBLIC_KEY)
    expect(promptsDrawn()).toBe(1)

    // Asking again with the answer already given draws nothing, so it counts
    // nothing: a counter that ticked here would cry wolf on a healthy app.
    await subscribeToPush(PUBLIC_KEY)
    await subscribeToPush(PUBLIC_KEY)
    phone.relaunch()
    await resubscribeToPush(PUBLIC_KEY)

    expect(promptsDrawn()).toBe(1)
    expect(phone.prompts()).toBe(1)
  })

  it('ticks once per permission genuinely lost', async () => {
    const phone = installedIphone()
    await subscribeToPush(PUBLIC_KEY)

    await phone.dropSubscription()
    await subscribeToPush(PUBLIC_KEY)

    expect(promptsDrawn()).toBe(2)
    expect(phone.prompts()).toBe(2)
  })
})

describe('the behaviour that was reported', () => {
  it('would come back if disabling dropped the iOS subscription', async () => {
    const phone = installedIphone()
    await subscribeToPush(PUBLIC_KEY)
    expect(phone.prompts()).toBe(1)

    // What the old disable path did, and the exact reason for the report: the
    // subscription goes, the permission goes with it, and the next tap prompts.
    await phone.dropSubscription()
    await subscribeToPush(PUBLIC_KEY)

    expect(phone.prompts()).toBe(2)
  })
})
