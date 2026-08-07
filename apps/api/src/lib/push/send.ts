import webpush from 'web-push'
import { env } from '../../env.js'

/**
 * Web Push, wrapped so the rest of the code never sees the library.
 *
 * The only interesting part is the three-way result: a push service answering
 * 404 or 410 is telling us that subscription is dead for good, and that is the
 * one and only signal we get to prune the row. Everything else is transient and
 * has to be treated as "maybe later", never as "delete the device".
 */

export type PushResult = 'sent' | 'gone' | 'failed'

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * What the service worker receives. Deliberately thin: no food names, no
 * numbers, no diary content. The payload is encrypted end-to-end, but a
 * notification also sits on a lock screen — and there is nothing in a reminder
 * that needs the user's data to be useful.
 */
export interface PushPayload {
  title: string
  body: string
  /** In-app path opened on tap. */
  url: string
  /** Collapse key: a second notification with the same tag replaces the first. */
  tag: string
}

/** True when the server has VAPID keys, i.e. when push can work at all. */
export function pushConfigured() {
  return env.push !== null
}

let vapidSet = false

/** web-push keeps the VAPID details in module state; set them once, lazily. */
function ensureVapid() {
  if (vapidSet || !env.push) return
  webpush.setVapidDetails(
    env.push.subject,
    env.push.publicKey,
    env.push.privateKey,
  )
  vapidSet = true
}

/**
 * A reminder that arrives an hour late is worse than one that never arrives, so
 * the push service is told to drop it rather than hold it: the grace window in
 * the scheduler already decides how late is too late.
 */
const TTL_SECONDS = 30 * 60

export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<PushResult> {
  if (!env.push) return 'failed'
  ensureVapid()

  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload),
      {
        TTL: TTL_SECONDS,
        urgency: 'normal',
        // Lets the push service collapse a queued reminder with its successor.
        topic: topicFor(payload.tag),
      },
    )
    return 'sent'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'gone'
    // 403 is the push service saying the VAPID key that signed this push is not
    // the one the subscription was created with. That never fixes itself: the
    // browser holds the old public key inside the subscription, so after a key
    // rotation every push to it is rejected forever. Treating it as dead is
    // what lets the settings screen notice ("no devices") and re-subscribe —
    // the alternative is a row that looks healthy and never delivers again.
    if (status === 403) return 'gone'
    return 'failed'
  }
}

/**
 * The Topic header is limited to 32 base64url characters, which our tags
 * ('meal-lunch', 'reminder-test') already are — but a user-supplied label must
 * never be able to make a push fail on a header, so it is trimmed and filtered.
 */
function topicFor(tag: string) {
  return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'calorico'
}
