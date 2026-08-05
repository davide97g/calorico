import type { FastifyPluginAsync } from 'fastify'
import { eq, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { profiles, users } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../lib/password.js'

const credentials = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
})

const registerBody = credentials.extend({
  name: z.string().min(1).max(80),
})

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const body = registerBody.parse(request.body)
    const email = body.email.toLowerCase().trim()

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(raw`lower(${users.email}) = ${email}`)
      .limit(1)
    if (existing) return reply.code(409).send({ error: 'email_taken' })

    const passwordHash = await hashPassword(body.password)
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, passwordHash, name: body.name.trim() })
        .returning()
      // Sensible defaults so the dashboard is never empty of targets.
      await tx.insert(profiles).values({ userId: created!.id })
      return created!
    })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return reply.code(201).send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      needsOnboarding: true,
    })
  })

  app.post('/login', async (request, reply) => {
    const body = credentials.parse(request.body)
    const email = body.email.toLowerCase().trim()

    const [user] = await db
      .select()
      .from(users)
      .where(raw`lower(${users.email}) = ${email}`)
      .limit(1)

    // Same response for unknown email and wrong password.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    const [profile] = await db
      .select({ heightCm: profiles.heightCm })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1)

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
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
      },
      profile: row.profile,
      needsOnboarding: row.profile?.heightCm == null,
    }
  })
}
