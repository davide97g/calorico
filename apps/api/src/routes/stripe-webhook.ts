import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'
import type Stripe from 'stripe'
import { env } from '../env.js'
import { getStripe, syncSubscription } from '../lib/stripe.js'

/**
 * Where premium is actually granted.
 *
 * Registered as its own plugin, outside the authenticated one: Stripe has no
 * token of ours, and the signature over the raw body is what proves the request
 * came from Stripe. That is why this file needs the bytes exactly as they
 * arrived — JSON.parse then re-stringify changes them and the signature fails.
 * The parser below is encapsulated in this plugin and leaves every other route
 * on Fastify's normal JSON handling.
 */
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  )

  app.post(
    '/webhook',
    {
      // Stripe retries on failure and can bunch events up after an outage; the
      // app-wide 300/min is sized for a browser, not for that.
      config: { rateLimit: false },
    },
    async (request, reply) => {
      const stripe = getStripe()
      if (!stripe || !env.stripe)
        return reply.code(503).send({ error: 'payments_disabled' })

      const signature = request.headers['stripe-signature']
      if (typeof signature !== 'string')
        return reply.code(400).send({ error: 'missing_signature' })

      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          signature,
          env.stripe.webhookSecret,
        )
      } catch (err) {
        // Either someone found the URL, or the secret does not match the
        // endpoint Stripe is sending from. Both are a 400, never a 500: a 5xx
        // makes Stripe retry something that will never verify.
        request.log.warn({ err }, 'stripe webhook signature rejected')
        return reply.code(400).send({ error: 'invalid_signature' })
      }

      try {
        await handle(event, request.log)
      } catch (err) {
        // A 500 is the honest answer — Stripe retries with backoff, which is
        // exactly what a database that was briefly down needs.
        request.log.error(
          { err, type: event.type, eventId: event.id },
          'stripe webhook handling failed',
        )
        return reply.code(500).send({ error: 'webhook_failed' })
      }

      return { received: true }
    },
  )
}

async function handle(
  event: Stripe.Event,
  log: FastifyBaseLogger,
): Promise<void> {
  const stripe = getStripe()!

  switch (event.type) {
    /**
     * The subscription's whole life: created, renewed, payment failed, price
     * changed, cancelled. Every one of them carries the current status, so one
     * branch keeps the flag right without tracking what changed.
     */
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const userId = await syncSubscription(event.data.object)
      log.info(
        { userId, status: event.data.object.status, type: event.type },
        'premium synced from stripe',
      )
      break
    }

    /**
     * Belt to the subscription events' braces: this is the first thing Stripe
     * sends after a successful checkout, so the flag can be right before the
     * browser has finished coming back.
     */
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription' || !session.subscription) break

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const userId = await syncSubscription(subscription)
      log.info({ userId, subscriptionId }, 'checkout completed')
      break
    }

    default:
      // Everything else Stripe decides to send. Answering 200 keeps it from
      // retrying events this app has no opinion about.
      break
  }
}
