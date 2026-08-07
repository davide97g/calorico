import { and, eq, gt, isNull, or, sql as raw } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { env } from '../env.js'

export interface PhotoQuota {
  isPremium: boolean
  /** Free photos analysed over the life of the account. */
  used: number
  /** null for premium, which is uncapped. */
  limit: number | null
  /** null for premium. */
  remaining: number | null
}

/**
 * Premium is `is_premium` and still inside the period that was paid for. The
 * date is the safety net: if the `subscription.deleted` webhook never reaches
 * us — the container was down, the endpoint was misconfigured — the account
 * falls back to free on its own instead of staying premium forever.
 */
const stillPremium = and(
  eq(users.isPremium, true),
  or(isNull(users.premiumUntil), gt(users.premiumUntil, raw`now()`)),
)!

export async function photoQuota(userId: string): Promise<PhotoQuota> {
  const [user] = await db
    .select({
      isPremium: raw<boolean>`(${stillPremium})`,
      used: users.freePhotoScansUsed,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const isPremium = user?.isPremium ?? false
  const used = user?.used ?? 0

  if (isPremium) return { isPremium, used, limit: null, remaining: null }

  const limit = env.FREE_PHOTO_SCANS
  return { isPremium, used, limit, remaining: Math.max(0, limit - used) }
}

/**
 * Claims one photo off the free allowance, or reports there is none left.
 *
 * The check and the increment are one statement on purpose: two photos uploaded
 * at the same moment would both read "0 used" and both go through, and with an
 * allowance of one that doubles what a free account gets. Premium accounts pass
 * without touching the counter — they have nothing to count.
 *
 * Call `releaseFreePhotoScan` if whatever the photo was claimed for then fails:
 * nobody should lose their one free analysis to a provider outage.
 */
export async function claimFreePhotoScan(userId: string): Promise<boolean> {
  const claimed = await db
    .update(users)
    .set({ freePhotoScansUsed: raw`${users.freePhotoScansUsed} + 1` })
    .where(
      and(
        eq(users.id, userId),
        raw`not (${stillPremium})`,
        raw`${users.freePhotoScansUsed} < ${env.FREE_PHOTO_SCANS}`,
      ),
    )
    .returning({ id: users.id })

  if (claimed.length > 0) return true

  // Either the allowance is gone or the account is premium; only the first is a
  // refusal, and premium never got here through the counter anyway.
  const quota = await photoQuota(userId)
  return quota.isPremium
}

/**
 * Hands back a claim whose analysis never happened. Never goes below zero, and
 * skips premium accounts for the same reason the claim does: they never spent
 * anything, and quietly decrementing their counter would gift them a free
 * analysis the day they cancel.
 */
export async function releaseFreePhotoScan(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      freePhotoScansUsed: raw`greatest(${users.freePhotoScansUsed} - 1, 0)`,
    })
    .where(and(eq(users.id, userId), raw`not (${stillPremium})`))
}
