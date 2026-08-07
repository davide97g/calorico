import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { diaryEntries, foods, families, users } from '../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

describe.skipIf(!hasDb)('account and premium', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
  })

  /** A custom food plus a diary entry, so deletion has something to clear. */
  const logSomething = async (user: TestUser) => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(user),
      payload: {
        name: 'Torta della nonna',
        kcal100: 380,
        protein100: 6,
        carbs100: 45,
        fat100: 19,
      },
    })
    expect(created.statusCode).toBe(201)
    const foodId = (created.json() as { id: string }).id

    const entry = await app.inject({
      method: 'POST',
      url: '/api/diary',
      headers: auth(user),
      payload: {
        foodId,
        day: '2026-08-06',
        meal: 'lunch',
        quantityG: 120,
      },
    })
    expect(entry.statusCode).toBe(201)
    return foodId
  }

  describe('deletion', () => {
    it('needs the right password', async () => {
      const user = await createUser(app)

      const wrong = await app.inject({
        method: 'DELETE',
        url: '/api/profile',
        headers: auth(user),
        payload: { password: 'not-the-password' },
      })
      expect(wrong.statusCode).toBe(401)

      const stillThere = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect(stillThere.statusCode).toBe(200)
    })

    it('removes the account, its diary and the foods it authored', async () => {
      const user = await createUser(app)
      const foodId = await logSomething(user)

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/profile',
        headers: auth(user),
        payload: { password: user.password },
      })
      expect(res.statusCode).toBe(204)

      expect(
        await db.select().from(users).where(eq(users.id, user.id)),
      ).toHaveLength(0)
      expect(
        await db
          .select()
          .from(diaryEntries)
          .where(eq(diaryEntries.userId, user.id)),
      ).toHaveLength(0)
      expect(
        await db.select().from(foods).where(eq(foods.id, foodId)),
      ).toHaveLength(0)

      // And the token stops working immediately.
      const after = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect(after.statusCode).toBe(401)
    })

    it('drops a family left with nobody in it', async () => {
      const user = await createUser(app)
      const family = await app.inject({
        method: 'POST',
        url: '/api/families',
        headers: auth(user),
        payload: { name: 'Casa Sola' },
      })
      const familyId = (family.json() as { id: string }).id

      await app.inject({
        method: 'DELETE',
        url: '/api/profile',
        headers: auth(user),
        payload: { password: user.password },
      })

      expect(
        await db.select().from(families).where(eq(families.id, familyId)),
      ).toHaveLength(0)
    })

    it('keeps a family that still has other members', async () => {
      const alice = await createUser(app)
      const bob = await createUser(app)

      const family = await app.inject({
        method: 'POST',
        url: '/api/families',
        headers: auth(alice),
        payload: { name: 'Casa Condivisa' },
      })
      const familyId = (family.json() as { id: string }).id

      const invite = await app.inject({
        method: 'POST',
        url: `/api/families/${familyId}/invites`,
        headers: auth(alice),
      })
      const token = (invite.json() as { token: string }).token
      await app.inject({
        method: 'POST',
        url: `/api/families/invites/${token}/accept`,
        headers: auth(bob),
      })

      await app.inject({
        method: 'DELETE',
        url: '/api/profile',
        headers: auth(alice),
        payload: { password: alice.password },
      })

      expect(
        await db.select().from(families).where(eq(families.id, familyId)),
      ).toHaveLength(1)

      // Bob can still reach the shared list.
      const list = await app.inject({
        method: 'GET',
        url: '/api/grocery',
        headers: auth(bob),
      })
      expect(list.statusCode).toBe(200)
    })

    it("leaves other people's foods alone", async () => {
      const alice = await createUser(app)
      const bob = await createUser(app)
      const aliceFood = await logSomething(alice)
      const bobFood = await logSomething(bob)

      await app.inject({
        method: 'DELETE',
        url: '/api/profile',
        headers: auth(alice),
        payload: { password: alice.password },
      })

      expect(
        await db.select().from(foods).where(eq(foods.id, bobFood)),
      ).toHaveLength(1)
      expect(
        await db.select().from(foods).where(eq(foods.id, aliceFood)),
      ).toHaveLength(0)
    })
  })

  describe('photo quota', () => {
    /** The stub provider answers from a fixture, so nothing is spent here. */
    const analyse = (user: TestUser) =>
      app.inject({
        method: 'POST',
        url: '/api/vision/meal',
        headers: auth(user),
        payload: {
          // Any base64 over the 32-character minimum; the stub ignores it.
          image: 'a'.repeat(64),
          contentType: 'image/webp',
        },
      })

    /**
     * What the Stripe webhook does, without Stripe: the tests run on a server
     * with no keys, and every route that talks to Stripe is switched off there.
     * `until` is the end of the period paid for.
     */
    const grantPremium = (user: TestUser, until: Date | null) =>
      db
        .update(users)
        .set({ isPremium: true, premiumSince: new Date(), premiumUntil: until })
        .where(eq(users.id, user.id))

    const inDays = (days: number) =>
      new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    it('gives one free analysis, then answers 402', async () => {
      const user = await createUser(app)

      // FREE_PHOTO_SCANS defaults to 1 — one taste, then the paywall.
      expect((await analyse(user)).statusCode).toBe(200)

      const blocked = await analyse(user)
      expect(blocked.statusCode).toBe(402)
      expect(blocked.json()).toMatchObject({
        error: 'photo_quota_exceeded',
        used: 1,
        limit: 1,
      })
    })

    it('counts down as photos are used', async () => {
      const user = await createUser(app)

      const before = await app.inject({
        method: 'GET',
        url: '/api/vision/status',
        headers: auth(user),
      })
      expect(before.json()).toMatchObject({
        enabled: true,
        quota: { used: 0, limit: 1, remaining: 1, isPremium: false },
      })

      await analyse(user)

      const after = await app.inject({
        method: 'GET',
        url: '/api/vision/status',
        headers: auth(user),
      })
      expect(after.json()).toMatchObject({ quota: { used: 1, remaining: 0 } })
    })

    it('counts each account separately', async () => {
      const alice = await createUser(app)
      const bob = await createUser(app)

      await analyse(alice)
      expect((await analyse(alice)).statusCode).toBe(402)
      expect((await analyse(bob)).statusCode).toBe(200)
    })

    it('lifts the cap for a live subscription', async () => {
      const user = await createUser(app)
      await analyse(user)
      expect((await analyse(user)).statusCode).toBe(402)

      await grantPremium(user, inDays(30))

      const status = await app.inject({
        method: 'GET',
        url: '/api/premium',
        headers: auth(user),
      })
      expect(status.json()).toMatchObject({
        isPremium: true,
        photoQuota: { isPremium: true, limit: null, remaining: null },
      })

      for (let i = 0; i < 3; i += 1) {
        expect((await analyse(user)).statusCode).toBe(200)
      }
    })

    /**
     * The safety net for a `subscription.deleted` webhook that never arrived:
     * past the period that was paid for the account reads as free again, even
     * though the flag is still set.
     */
    it('puts the cap back once the paid period has ended', async () => {
      const user = await createUser(app)
      await grantPremium(user, inDays(-1))

      const status = await app.inject({
        method: 'GET',
        url: '/api/premium',
        headers: auth(user),
      })
      expect(status.json()).toMatchObject({
        isPremium: false,
        photoQuota: { isPremium: false, limit: 1, remaining: 1 },
      })

      expect((await analyse(user)).statusCode).toBe(200)
      expect((await analyse(user)).statusCode).toBe(402)
    })

    it('does not spend the free photo on a premium account', async () => {
      const user = await createUser(app)
      await grantPremium(user, inDays(30))
      for (let i = 0; i < 3; i += 1) await analyse(user)

      const [row] = await db
        .select({ used: users.freePhotoScansUsed })
        .from(users)
        .where(eq(users.id, user.id))
      expect(row?.used).toBe(0)
    })

    it('marks the account premium everywhere, not just in /premium', async () => {
      const user = await createUser(app)
      await grantPremium(user, inDays(30))

      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect((me.json() as { user: { isPremium: boolean } }).user.isPremium).toBe(
        true,
      )

      const [row] = await db
        .select({ premium: users.isPremium })
        .from(users)
        .where(and(eq(users.id, user.id), eq(users.isPremium, true)))
      expect(row?.premium).toBe(true)
    })
  })

  /**
   * This server has no Stripe keys, so every paying route is off. What matters
   * is that "off" means refusing, not quietly granting premium — the paywall
   * must not be liftable by a client that just calls the checkout endpoint.
   */
  describe('payments, unconfigured', () => {
    it('refuses checkout instead of handing out premium', async () => {
      const user = await createUser(app)

      const checkout = await app.inject({
        method: 'POST',
        url: '/api/premium/checkout',
        headers: auth(user),
      })
      expect(checkout.statusCode).toBe(503)
      expect(checkout.json()).toMatchObject({ error: 'payments_disabled' })

      const [row] = await db
        .select({ premium: users.isPremium })
        .from(users)
        .where(eq(users.id, user.id))
      expect(row?.premium).toBe(false)
    })

    it('tells the client payments are unavailable', async () => {
      const user = await createUser(app)
      const status = await app.inject({
        method: 'GET',
        url: '/api/premium',
        headers: auth(user),
      })
      expect(status.json()).toMatchObject({
        paymentsEnabled: false,
        isPremium: false,
      })
    })

    it('refuses the portal and the cancellation', async () => {
      const user = await createUser(app)
      for (const [method, url] of [
        ['POST', '/api/premium/portal'],
        ['DELETE', '/api/premium'],
      ] as const) {
        const res = await app.inject({ method, url, headers: auth(user) })
        expect(res.statusCode).toBe(503)
      }
    })

    it('takes the webhook without a token but never on trust', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/premium/webhook',
        payload: { type: 'customer.subscription.created' },
      })
      // 503 here because Stripe is unconfigured; what matters is that it is not
      // a 401 — the endpoint is public — and not a 200 either.
      expect(res.statusCode).toBe(503)
    })
  })

  describe('readiness', () => {
    it('reports the database as reachable', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ready' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true, db: 'up' })
    })

    it('answers liveness without touching the database', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ ok: true })
    })
  })
})
