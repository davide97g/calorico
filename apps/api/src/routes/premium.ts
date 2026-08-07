import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { env } from '../env.js'
import { photoQuota } from '../lib/premium.js'
import {
  ensureCustomer,
  getStripe,
  loadSubscription,
  syncSubscription,
} from '../lib/stripe.js'

/**
 * Premium: a 5 €/month subscription that lifts the cap on meal-photo analysis.
 *
 * Nothing here grants premium. Checkout only hands the browser to Stripe; the
 * flag is written by the webhook once Stripe says the subscription is live —
 * see routes/stripe-webhook.ts. That split is the point: a browser that never
 * comes back, or comes back with a URL someone typed by hand, cannot pay for
 * itself.
 *
 * With Stripe unconfigured every paying route answers 503 and the client hides
 * the button. There is no fallback that flips the flag for free: the paywall is
 * the product now.
 */
/**
 * What the paywall says it costs. The price that is actually charged is the one
 * on STRIPE_PRICE_ID — this is copy, and the two are kept in step by hand.
 */
const PRICE_EUR = 5

export const premiumRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const [user] = await db
      .select({
        isPremium: users.isPremium,
        since: users.premiumSince,
        until: users.premiumUntil,
        cancelAtPeriodEnd: users.premiumCancelAtPeriodEnd,
      })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    const quota = await photoQuota(request.user.sub)

    return {
      // The quota is the one that knows about an expired paid period, so it
      // decides — otherwise a lapsed account would still read as premium here.
      isPremium: quota.isPremium,
      since: user?.since ?? null,
      until: user?.until ?? null,
      cancelAtPeriodEnd: user?.cancelAtPeriodEnd ?? false,
      /** False on a server without Stripe keys: the client hides the paywall. */
      paymentsEnabled: env.stripe !== null,
      priceEur: PRICE_EUR,
      photoQuota: quota,
    }
  })

  /**
   * Starts a Stripe Checkout session and answers with its URL; the client sends
   * the browser there. Safe to call twice — an abandoned session simply expires.
   */
  app.post('/checkout', async (request, reply) => {
    const stripe = getStripe()
    if (!stripe || !env.stripe)
      return reply.code(503).send({ error: 'payments_disabled' })

    const quota = await photoQuota(request.user.sub)
    if (quota.isPremium) return reply.code(409).send({ error: 'already_premium' })

    const customerId = await ensureCustomer(request.user.sub)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: env.stripe.priceId, quantity: 1 }],
      // The return page polls until the webhook has landed, so it needs the id.
      success_url: `${env.appUrl}/premium/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/profile`,
      client_reference_id: request.user.sub,
      // Copied onto the subscription so the webhook can find the account
      // without a database lookup keyed on the customer.
      subscription_data: { metadata: { userId: request.user.sub } },
      allow_promotion_codes: true,
      locale: 'it',
    })

    if (!session.url)
      return reply.code(502).send({ error: 'checkout_unavailable' })

    return { url: session.url }
  })

  /**
   * Asks Stripe directly what this customer is subscribed to and applies it.
   *
   * The webhook is what normally grants premium, and this changes nothing it
   * would not have written — it only removes the wait. It is also what makes
   * the flow work on a laptop with no public URL for Stripe to call back.
   */
  app.post('/sync', async (request, reply) => {
    const stripe = getStripe()
    if (!stripe) return reply.code(503).send({ error: 'payments_disabled' })

    const [user] = await db
      .select({ customerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    if (user?.customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.customerId,
        status: 'all',
        limit: 3,
      })
      // Newest first, which is what a resubscription leaves behind.
      const live =
        subscriptions.data.find((s) => s.status === 'active' || s.status === 'trialing') ??
        subscriptions.data[0]
      if (live) await syncSubscription(live)
    }

    const quota = await photoQuota(request.user.sub)
    const [after] = await db
      .select({
        since: users.premiumSince,
        until: users.premiumUntil,
        cancelAtPeriodEnd: users.premiumCancelAtPeriodEnd,
      })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    return {
      isPremium: quota.isPremium,
      since: after?.since ?? null,
      until: after?.until ?? null,
      cancelAtPeriodEnd: after?.cancelAtPeriodEnd ?? false,
      paymentsEnabled: true,
      priceEur: PRICE_EUR,
      photoQuota: quota,
    }
  })

  /**
   * The Stripe customer portal: cards, invoices, cancellation. Everything past
   * the first payment is Stripe's screens rather than ours — this app has no
   * business storing a card or rendering a receipt.
   */
  app.post('/portal', async (request, reply) => {
    const stripe = getStripe()
    if (!stripe) return reply.code(503).send({ error: 'payments_disabled' })

    const [user] = await db
      .select({ customerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    if (!user?.customerId)
      return reply.code(409).send({ error: 'no_subscription' })

    const session = await stripe.billingPortal.sessions.create({
      customer: user.customerId,
      return_url: `${env.appUrl}/profile`,
      locale: 'it',
    })

    return { url: session.url }
  })

  /**
   * Cancels at the end of the period already paid for, rather than immediately:
   * the month is bought, and taking the feature away mid-month for someone who
   * pressed cancel on day two is a refund request waiting to happen.
   */
  app.delete('/', async (request, reply) => {
    const stripe = getStripe()
    if (!stripe) return reply.code(503).send({ error: 'payments_disabled' })

    const subscription = await loadSubscription(request.user.sub)
    if (!subscription) return reply.code(409).send({ error: 'no_subscription' })

    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    })
    // The webhook says the same thing a moment later; doing it here means the
    // answer to this request already reflects it.
    await syncSubscription(updated)

    const [user] = await db
      .select({ since: users.premiumSince, until: users.premiumUntil })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1)

    return {
      isPremium: true,
      since: user?.since ?? null,
      until: user?.until ?? null,
      cancelAtPeriodEnd: true,
      paymentsEnabled: true,
      priceEur: PRICE_EUR,
      photoQuota: await photoQuota(request.user.sub),
    }
  })
}
