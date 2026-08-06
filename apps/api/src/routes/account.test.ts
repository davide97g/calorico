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

    it('caps the free tier and answers 402 past it', async () => {
      const user = await createUser(app)

      // FREE_DAILY_PHOTO_SCANS defaults to 3.
      for (let i = 0; i < 3; i += 1) {
        expect((await analyse(user)).statusCode).toBe(200)
      }

      const blocked = await analyse(user)
      expect(blocked.statusCode).toBe(402)
      expect(blocked.json()).toMatchObject({
        error: 'photo_quota_exceeded',
        used: 3,
        limit: 3,
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
        quota: { used: 0, limit: 3, remaining: 3, isPremium: false },
      })

      await analyse(user)

      const after = await app.inject({
        method: 'GET',
        url: '/api/vision/status',
        headers: auth(user),
      })
      expect(after.json()).toMatchObject({
        quota: { used: 1, remaining: 2 },
      })
    })

    it('counts each account separately', async () => {
      const alice = await createUser(app)
      const bob = await createUser(app)

      for (let i = 0; i < 3; i += 1) await analyse(alice)
      expect((await analyse(alice)).statusCode).toBe(402)
      expect((await analyse(bob)).statusCode).toBe(200)
    })

    it('lifts the cap once the placeholder checkout runs', async () => {
      const user = await createUser(app)
      for (let i = 0; i < 3; i += 1) await analyse(user)
      expect((await analyse(user)).statusCode).toBe(402)

      const checkout = await app.inject({
        method: 'POST',
        url: '/api/premium/checkout',
        headers: auth(user),
      })
      expect(checkout.statusCode).toBe(200)
      expect(checkout.json()).toMatchObject({
        isPremium: true,
        photoQuota: { isPremium: true, limit: null, remaining: null },
      })

      expect((await analyse(user)).statusCode).toBe(200)
    })

    it('puts the cap back when premium is cancelled', async () => {
      const user = await createUser(app)
      await app.inject({
        method: 'POST',
        url: '/api/premium/checkout',
        headers: auth(user),
      })
      for (let i = 0; i < 4; i += 1) {
        expect((await analyse(user)).statusCode).toBe(200)
      }

      const cancelled = await app.inject({
        method: 'DELETE',
        url: '/api/premium',
        headers: auth(user),
      })
      expect(cancelled.json()).toMatchObject({ isPremium: false })

      // Four already used against a limit of three.
      expect((await analyse(user)).statusCode).toBe(402)
    })

    it('marks the account premium everywhere, not just in /premium', async () => {
      const user = await createUser(app)
      await app.inject({
        method: 'POST',
        url: '/api/premium/checkout',
        headers: auth(user),
      })

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
