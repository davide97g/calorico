import type { FastifyBaseLogger } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { foodTouches } from '../db/schema.js'

/**
 * Remembers that this user met this food, so it shows up in their recents even
 * if they never log it.
 *
 * Best-effort, like recordScan: the lookup the user asked for already
 * succeeded, and losing a recents row is never a reason to fail it.
 *
 * Upsert rather than an append-only log. A food opened ten times is not ten
 * times as familiar as one opened once — the ranking only ever reads the last
 * encounter — and one row per user and food keeps a table that every food
 * lookup writes to from growing without bound.
 */
export async function recordFoodTouch(
  userId: string,
  foodId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await db
      .insert(foodTouches)
      .values({ userId, foodId })
      .onConflictDoUpdate({
        target: [foodTouches.userId, foodTouches.foodId],
        set: {
          times: sql`${foodTouches.times} + 1`,
          lastAt: sql`now()`,
        },
      })
  } catch (err) {
    log.warn({ err, foodId }, 'failed to record food touch')
  }
}
