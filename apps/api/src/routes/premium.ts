import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { photoQuota } from '../lib/premium.js'

/**
 * Premium, without a payment provider.
 *
 * There is no Stripe, no card, no charge: `POST /checkout` simply flips the flag
 * and the client shows a receipt-shaped confirmation. It exists so the paywall
 * around meal-photo analysis can be built, walked through and demoed before any
 * billing decision is made — and so the quota code has something to switch on.
 *
 * Whatever eventually does the charging replaces the body of /checkout only:
 * everything else already reads users.is_premium.
 */
export const premiumRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const [user] = await db
      .select({ isPremium: users.isPremium, since: users.premiumSince })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    return {
      isPremium: user?.isPremium ?? false,
      since: user?.since ?? null,
      photoQuota: await photoQuota(request.user.sub),
    }
  })

  app.post('/checkout', async (request) => {
    const [updated] = await db
      .update(users)
      .set({ isPremium: true, premiumSince: new Date() })
      .where(eq(users.id, request.user.sub))
      .returning({ isPremium: users.isPremium, since: users.premiumSince })

    request.log.info(
      { userId: request.user.sub },
      'premium granted by the placeholder checkout — no payment was taken',
    )

    return {
      isPremium: updated?.isPremium ?? true,
      since: updated?.since ?? null,
      photoQuota: await photoQuota(request.user.sub),
    }
  })

  /** Drops back to the free tier. Makes the paywall testable more than once. */
  app.delete('/', async (request) => {
    await db
      .update(users)
      .set({ isPremium: false, premiumSince: null })
      .where(eq(users.id, request.user.sub))

    return {
      isPremium: false,
      since: null,
      photoQuota: await photoQuota(request.user.sub),
    }
  })
}
