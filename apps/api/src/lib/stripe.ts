import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { env } from '../env.js'

let cached: Stripe | null | undefined

/**
 * The Stripe client, or null when payments are not configured. Built lazily so
 * the tests — which never set a key — never construct one.
 */
export function getStripe(): Stripe | null {
  if (cached === undefined) {
    cached = env.stripe
      ? new Stripe(env.stripe.secretKey, {
          // Three attempts on a network blip; Stripe's own advice, and cheap
          // here because every call we make is idempotent or a read.
          maxNetworkRetries: 3,
          timeout: 15_000,
        })
      : null
  }
  return cached
}

/** Statuses that actually entitle someone to the feature. */
const ENTITLING = new Set<Stripe.Subscription.Status>(['active', 'trialing'])

/**
 * The end of the period paid for. As of the 2025 API versions this moved off
 * the subscription and onto its items, so read it from there and take the
 * latest — a subscription with one price, which is all we sell, has exactly one.
 */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((v): v is number => typeof v === 'number')
  if (ends.length === 0) return null
  return new Date(Math.max(...ends) * 1000)
}

/**
 * Points a subscription at the account it belongs to. The metadata written at
 * checkout is the reliable link; the customer id is the fallback for anything
 * created from the Stripe dashboard by hand.
 */
async function findUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId
  if (fromMetadata) return fromMetadata

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)

  return user?.id ?? null
}

/**
 * Copies a subscription's state onto the account. The single place premium is
 * granted or taken away: every webhook and the checkout return both land here,
 * so replaying an event out of order can only ever re-apply the truth Stripe
 * just handed us.
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const userId = await findUserId(subscription)
  if (!userId) return null

  const isPremium = ENTITLING.has(subscription.status)
  const until = periodEnd(subscription)

  const [current] = await db
    .select({ since: users.premiumSince })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  await db
    .update(users)
    .set({
      isPremium,
      // The first day they paid, kept across a lapse and a resubscription.
      premiumSince: current?.since ?? (isPremium ? new Date() : null),
      premiumUntil: isPremium ? until : null,
      premiumCancelAtPeriodEnd: isPremium && subscription.cancel_at_period_end,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
    })
    .where(eq(users.id, userId))

  return userId
}

/**
 * The Stripe customer for this account, created on first use. The idempotency
 * key is what stops two taps on the pay button from leaving two customers
 * behind, one of which would then be billed by nobody.
 */
export async function ensureCustomer(userId: string): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error('stripe is not configured')

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      customerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error('user not found')
  if (user.customerId) return user.customerId

  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.name,
      metadata: { userId },
    },
    { idempotencyKey: `calorico-customer-${userId}` },
  )

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, userId))

  return customer.id
}

/** The account's live subscription, or null if they never had one. */
export async function loadSubscription(
  userId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const [user] = await db
    .select({ subscriptionId: users.stripeSubscriptionId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.subscriptionId) return null

  try {
    return await stripe.subscriptions.retrieve(user.subscriptionId)
  } catch {
    // Deleted in the dashboard, or belonging to a different account after a key
    // swap. Either way there is nothing to manage.
    return null
  }
}
