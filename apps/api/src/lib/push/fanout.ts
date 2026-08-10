import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { pushSubscriptions } from '../../db/schema.js'
import { sendPush, type PushPayload } from './send.js'

/**
 * Sending one payload to a set of devices, and keeping the table honest about
 * what happened.
 *
 * Two callers want this and they pick their devices differently — the reminder
 * scheduler takes every device of one user, the release notifier takes every
 * device on an old build — but what follows the send is identical, and it is the
 * part with consequences: a dead endpoint has to be deleted, because it will
 * never work again and every later pass would pay for it.
 */

export interface FanoutTarget {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type Sender = (
  target: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
) => Promise<'sent' | 'gone' | 'failed'>

export interface FanoutResult {
  sent: number
  /** Subscriptions deleted because the push service said they are gone. */
  removed: number
  /** Everything that did not arrive, including the removed ones. */
  failed: number
}

export async function fanout(
  targets: FanoutTarget[],
  payload: PushPayload,
  send: Sender = sendPush,
): Promise<FanoutResult> {
  const result: FanoutResult = { sent: 0, removed: 0, failed: 0 }

  for (const target of targets) {
    const verdict = await send(target, payload)

    if (verdict === 'sent') {
      result.sent += 1
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: new Date() })
        .where(eq(pushSubscriptions.id, target.id))
      continue
    }

    // Both remaining verdicts are a device that did not get it; only one of them
    // means the row is worthless. The count of the rest is what tells a caller
    // "there were devices, the push itself was refused" — the difference between
    // a misconfigured server and an account with no phone on it.
    result.failed += 1
    if (verdict === 'gone') {
      result.removed += 1
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, target.id))
    }
  }

  return result
}
