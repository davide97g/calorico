import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { eq, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { adminDb, db } from '../db/index.js'
import { profiles, users } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { PRIVACY_VERSION } from '../lib/privacy.js'

const credentials = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
})

const registerBody = credentials.extend({
  name: z.string().min(1).max(80),
  healthConsent: z.literal(true),
  ageAttested: z.literal(true),
})

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
})

/**
 * Rate-limit key for the credential routes: the route, the address being
 * attacked and the source. Per-IP alone lets one attacker spread guesses across
 * many accounts and lets a shared NAT lock out a household; per-email alone lets
 * anyone lock a known address out. Both together bound each pair.
 *
 * The route is in the key so registering an account does not eat the login
 * allowance for the same address — they are separate actions with separate
 * budgets.
 */
function credentialKey(request: FastifyRequest): string {
  const email =
    typeof request.body === 'object' && request.body !== null
      ? String((request.body as { email?: unknown }).email ?? '')
          .toLowerCase()
          .trim()
      : ''
  return `${request.routeOptions.url ?? request.url}:${request.ip}:${email}`
}

/**
 * Deliberately tighter than the app-wide 300/min, which is a denial-of-service
 * guard: at that rate a six-character password is guessable. Ten tries per
 * quarter hour is far more than a person mistypes and far less than a script
 * needs.
 */
const credentialRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: credentialKey,
      /**
       * The limiter runs at onRequest by default, which is before Fastify has
       * parsed the body — so keyGenerator would see no email and every attempt
       * from one address would share a bucket. preHandler is late enough to read
       * it and still early enough that no work has been done.
       */
      hook: 'preHandler' as const,
    },
  },
} as const

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', credentialRateLimit, async (request, reply) => {
    const body = registerBody.parse(request.body)
    const email = body.email.toLowerCase().trim()

    const [existing] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(raw`lower(${users.email}) = ${email}`)
      .limit(1)
    if (existing) return reply.code(409).send({ error: 'email_taken' })

    const passwordHash = await hashPassword(body.password)
    const consentedAt = new Date()
    const user = await adminDb.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          name: body.name.trim(),
          healthConsentAt: consentedAt,
          privacyVersion: PRIVACY_VERSION,
          termsAcceptedAt: consentedAt,
          ageAttestedAt: consentedAt,
        })
        .returning()
      // Sensible defaults so the dashboard is never empty of targets.
      await tx.insert(profiles).values({ userId: created!.id })
      return created!
    })

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      ver: user.tokenVersion,
    })
    return reply.code(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPremium: user.isPremium,
      },
      needsOnboarding: true,
    })
  })

  app.post('/login', credentialRateLimit, async (request, reply) => {
    const body = credentials.parse(request.body)
    const email = body.email.toLowerCase().trim()

    const [user] = await adminDb
      .select()
      .from(users)
      .where(raw`lower(${users.email}) = ${email}`)
      .limit(1)

    // Same response for unknown email and wrong password.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    const [profile] = await adminDb
      .select({ heightCm: profiles.heightCm })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1)

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      ver: user.tokenVersion,
    })
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isPremium: user.isPremium,
      },
      needsOnboarding: profile?.heightCm == null,
    }
  })

  app.get('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        isPremium: users.isPremium,
        profile: profiles,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, request.user.sub))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'not_found' })
    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatarUrl,
        isPremium: row.isPremium,
      },
      profile: row.profile,
      needsOnboarding: row.profile?.heightCm == null,
    }
  })

  /**
   * Changing the password invalidates every token, including the caller's own —
   * a stolen token must not outlive the theft being noticed. The fresh token in
   * the response keeps the current device signed in.
   */
  app.post(
    '/password',
    { onRequest: [app.authenticate], ...credentialRateLimit },
    async (request, reply) => {
      const body = passwordBody.parse(request.body)

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)
      if (!user) return reply.code(404).send({ error: 'not_found' })

      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      const [updated] = await db
        .update(users)
        .set({
          passwordHash: await hashPassword(body.newPassword),
          tokenVersion: user.tokenVersion + 1,
        })
        .where(eq(users.id, user.id))
        .returning({ tokenVersion: users.tokenVersion })

      return {
        token: app.jwt.sign({
          sub: user.id,
          email: user.email,
          ver: updated!.tokenVersion,
        }),
      }
    },
  )

  /** Signs every device out, this one included. No password needed. */
  app.post(
    '/logout-all',
    { onRequest: [app.authenticate] },
    async (request) => {
      await db
        .update(users)
        .set({ tokenVersion: raw`${users.tokenVersion} + 1` })
        .where(eq(users.id, request.user.sub))
      return { ok: true }
    },
  )
}
