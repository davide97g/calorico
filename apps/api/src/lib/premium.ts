import { and, eq, gte, sql as raw } from 'drizzle-orm'
import { db } from '../db/index.js'
import { scanEvents, users } from '../db/schema.js'
import { env } from '../env.js'

export interface PhotoQuota {
  isPremium: boolean
  /** Photos analysed in the last 24 hours. */
  used: number
  /** null for premium, which is uncapped. */
  limit: number | null
  /** null for premium. */
  remaining: number | null
}

/**
 * A rolling 24-hour window rather than a calendar day, on purpose: the server
 * has no idea which timezone the user is in, and a window nobody has to agree on
 * midnight for cannot be gamed by flying east. The UI says "ultime 24 ore".
 */
export async function photoQuota(userId: string): Promise<PhotoQuota> {
  const [user] = await db
    .select({ isPremium: users.isPremium })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const isPremium = user?.isPremium ?? false

  const [row] = await db
    .select({ used: raw<number>`count(*)::int` })
    .from(scanEvents)
    .where(
      and(
        eq(scanEvents.userId, userId),
        eq(scanEvents.kind, 'photo'),
        gte(scanEvents.createdAt, raw`now() - interval '24 hours'`),
      ),
    )

  const used = row?.used ?? 0
  if (isPremium) return { isPremium, used, limit: null, remaining: null }

  const limit = env.FREE_DAILY_PHOTO_SCANS
  return { isPremium, used, limit, remaining: Math.max(0, limit - used) }
}
