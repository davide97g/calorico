import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PushError,
  currentSubscription,
  needsInstallFirst,
  rememberEndpoint,
  rememberedEndpoint,
  resubscribeToPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'

/**
 * The rules under test are the ones no browser here can check for us: iOS keeps
 * the permission and the push subscription as one thing, and answers "no
 * subscription" for a subscription it still holds while a freshly launched app
 * is starting its worker. Both are why an app ends up asking for permission
 * again on every launch, so both are pinned down here.
 */

/** A base64url key of the right shape; only its bytes are ever compared. */
const PUBLIC_KEY = 'BNc7l1UJ8jRk8Yl7hRQ3cUuWjHTr5wZq0Yt2pKmXeCg'

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131'

interface FakeSubscription {
  endpoint: string
  unsubscribe: ReturnType<typeof vi.fn>
  options: { applicationServerKey: ArrayBuffer | null }
  toJSON: () => { keys: { p256dh: string; auth: string } }
}

function fakeSubscription(endpoint = 'https://push.example/abc'): FakeSubscription {
  return {
    endpoint,
    unsubscribe: vi.fn(async () => true),
    // Safari does not expose the key it subscribed with; push.ts trusts that.
    options: { applicationServerKey: null },
    toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
  }
}

interface EnvOptions {
  ios?: boolean
  standalone?: boolean
  permission?: NotificationPermission
  /** What `getSubscription()` answers, call by call. Last value repeats. */
  subscriptions?: (FakeSubscription | null)[]
  /** Omit to have no registration at all, as a dev build has. */
  registered?: boolean
  worker?: 'active' | 'starting'
  subscribeResult?: FakeSubscription | Error
  /** The worker script cannot be fetched: offline, or a build that lacks it. */
  registerFails?: boolean
}

function setupEnv({
  ios = true,
  standalone = true,
  permission = 'granted',
  subscriptions = [null],
  registered = true,
  worker = 'active',
  subscribeResult = fakeSubscription('https://push.example/fresh'),
  registerFails = false,
}: EnvOptions = {}) {
  const getSubscription = vi.fn(async () => {
    const next = subscriptions.length > 1 ? subscriptions.shift() : subscriptions[0]
    return next ?? null
  })

  const subscribe = vi.fn(async () => {
    if (subscribeResult instanceof Error) throw subscribeResult
    return subscribeResult
  })

  const requestPermission = vi.fn(async () => permission)

  const registration = {
    active: worker === 'active' ? {} : null,
    pushManager: { getSubscription, subscribe },
  }

  // A registration made on demand by push.ts itself, when there was none.
  const register = vi.fn(async () => {
    if (registerFails) throw new TypeError('sw fetch failed')
    registered = true
    return registration
  })

  const navigatorStub = {
    userAgent: ios ? IOS_UA : CHROME_UA,
    platform: ios ? 'iPhone' : 'Linux x86_64',
    maxTouchPoints: ios ? 5 : 0,
    standalone: ios ? standalone : undefined,
    serviceWorker: {
      getRegistration: vi.fn(async () => (registered ? registration : undefined)),
      register,
      // Only consulted when the registration has no active worker; a promise
      // that never settles is what a dev build with no worker looks like.
      ready: registered && worker === 'active' ? Promise.resolve(registration) : new Promise(() => {}),
    },
  }

  const notification = { permission, requestPermission }

  const windowStub = {
    Notification: notification,
    PushManager: class {},
    // Immediate, so the retry backoff does not make the suite wait on it.
    setTimeout: (fn: () => void) => globalThis.setTimeout(fn, 0),
    matchMedia: () => ({ matches: !ios && standalone }),
  }

  const store = new Map<string, string>()

  for (const [name, value] of [
    ['navigator', navigatorStub],
    ['window', windowStub],
    ['Notification', notification],
    [
      'localStorage',
      {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    ],
  ] as const) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    })
  }

  return { getSubscription, subscribe, requestPermission, register, store }
}

afterEach(() => {
  for (const name of ['navigator', 'window', 'Notification', 'localStorage']) {
    Reflect.deleteProperty(globalThis, name)
  }
})

describe('currentSubscription', () => {
  it('believes a subscription that only shows up on a later look', async () => {
    // WebKit on a cold start: the subscription is there, the first answer is not.
    const subscription = fakeSubscription()
    const { getSubscription } = setupEnv({
      subscriptions: [null, null, subscription],
    })

    expect(await currentSubscription()).toBe(subscription)
    expect(getSubscription).toHaveBeenCalledTimes(3)
  })

  it('gives up rather than retrying forever', async () => {
    const { getSubscription } = setupEnv({ subscriptions: [null] })

    expect(await currentSubscription()).toBeNull()
    expect(getSubscription).toHaveBeenCalledTimes(3)
  })

  it('waits for a worker to come up before asking it anything', async () => {
    const subscription = fakeSubscription()
    const { getSubscription } = setupEnv({
      worker: 'active',
      subscriptions: [subscription],
    })

    expect(await currentSubscription()).toBe(subscription)
    expect(getSubscription).toHaveBeenCalledTimes(1)
  })

  it('answers null where no worker was ever registered', async () => {
    const { getSubscription } = setupEnv({
      registered: false,
      registerFails: true,
    })

    expect(await currentSubscription()).toBeNull()
    expect(getSubscription).not.toHaveBeenCalled()
  })
})

describe('a registration iOS has discarded', () => {
  // An installed app left unopened for days comes back with no service worker.
  // Waiting for one that nothing is going to register is the dead end that told
  // the user "notifications are not available in this version of the app".
  it('is registered on the spot rather than reported as a broken build', async () => {
    const { register, subscribe } = setupEnv({
      registered: false,
      subscriptions: [null],
    })

    const payload = await subscribeToPush(PUBLIC_KEY)

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(payload.endpoint).toBe('https://push.example/fresh')
  })

  it('is only reported missing when the worker itself cannot be fetched', async () => {
    const { register } = setupEnv({ registered: false, registerFails: true })

    await expect(subscribeToPush(PUBLIC_KEY)).rejects.toMatchObject({
      code: 'no_service_worker',
    })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('does not re-register when one is already active', async () => {
    const { register } = setupEnv({ subscriptions: [null] })

    await subscribeToPush(PUBLIC_KEY)

    expect(register).not.toHaveBeenCalled()
  })
})

describe('resubscribeToPush', () => {
  it('never asks for permission, so it can never draw a prompt', async () => {
    const { requestPermission, subscribe } = setupEnv({
      permission: 'default',
    })

    expect(await resubscribeToPush(PUBLIC_KEY)).toBeNull()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('reuses the subscription this browser already holds', async () => {
    const existing = fakeSubscription('https://push.example/kept')
    const { subscribe } = setupEnv({ subscriptions: [existing] })

    const payload = await resubscribeToPush(PUBLIC_KEY)

    expect(payload?.endpoint).toBe('https://push.example/kept')
    // A new subscription would be a new endpoint, and on iOS a new prompt.
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('subscribes when there is genuinely nothing to reuse', async () => {
    const { subscribe } = setupEnv({ subscriptions: [null] })

    const payload = await resubscribeToPush(PUBLIC_KEY)

    expect(payload?.endpoint).toBe('https://push.example/fresh')
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('reports a refusal as nothing to do, not as an error', async () => {
    // iOS refuses to subscribe outside a tap, which is where this runs.
    const denied = Object.assign(new Error('no gesture'), {
      name: 'NotAllowedError',
    })
    setupEnv({ subscriptions: [null], subscribeResult: denied })

    expect(await resubscribeToPush(PUBLIC_KEY)).toBeNull()
  })
})

describe('subscribeToPush', () => {
  it('asks an iPhone in a Safari tab to install the app first', async () => {
    setupEnv({ ios: true, standalone: false })

    expect(needsInstallFirst()).toBe(true)
    await expect(subscribeToPush(PUBLIC_KEY)).rejects.toMatchObject({
      code: 'needs_install',
    })
  })

  it('does not ask again once the answer is granted', async () => {
    const existing = fakeSubscription('https://push.example/kept')
    const { requestPermission } = setupEnv({ subscriptions: [existing] })

    const payload = await subscribeToPush(PUBLIC_KEY)

    expect(payload.endpoint).toBe('https://push.example/kept')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('names a refusal', async () => {
    setupEnv({ permission: 'denied' })

    await expect(subscribeToPush(PUBLIC_KEY)).rejects.toBeInstanceOf(PushError)
    await expect(subscribeToPush(PUBLIC_KEY)).rejects.toMatchObject({
      code: 'denied',
    })
  })
})

describe('unsubscribeFromPush', () => {
  it('keeps the iOS subscription alive, because it is the permission', async () => {
    const existing = fakeSubscription('https://push.example/kept')
    setupEnv({ ios: true, subscriptions: [existing] })

    expect(await unsubscribeFromPush()).toBe('https://push.example/kept')
    expect(existing.unsubscribe).not.toHaveBeenCalled()
  })

  it('drops it everywhere else, where permission outlives it', async () => {
    const existing = fakeSubscription('https://push.example/gone')
    setupEnv({ ios: false, subscriptions: [existing] })

    expect(await unsubscribeFromPush()).toBe('https://push.example/gone')
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('falls back to the endpoint it remembers when the browser has none', async () => {
    setupEnv({ subscriptions: [null] })
    rememberEndpoint('https://push.example/remembered')

    expect(await unsubscribeFromPush()).toBe('https://push.example/remembered')
  })
})

describe('rememberedEndpoint', () => {
  it('round-trips, and forgets on null', () => {
    setupEnv()

    expect(rememberedEndpoint()).toBeNull()
    rememberEndpoint('https://push.example/abc')
    expect(rememberedEndpoint()).toBe('https://push.example/abc')
    rememberEndpoint(null)
    expect(rememberedEndpoint()).toBeNull()
  })

  it('survives storage the browser will not give us', () => {
    setupEnv()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
      },
      configurable: true,
      writable: true,
    })

    expect(() => rememberEndpoint('https://push.example/abc')).not.toThrow()
    expect(rememberedEndpoint()).toBeNull()
  })
})
