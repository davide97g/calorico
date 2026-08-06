import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import * as Sentry from '@sentry/node'
import { eq } from 'drizzle-orm'
import { ZodError } from 'zod'
import { db, sql } from './db/index.js'
import { users } from './db/schema.js'
import { env } from './env.js'
import { premiumRoutes } from './routes/premium.js'
import { authRoutes } from './routes/auth.js'
import { profileRoutes } from './routes/profile.js'
import { foodRoutes } from './routes/foods.js'
import { foodImageRoutes } from './routes/food-images.js'
import { diaryRoutes } from './routes/diary.js'
import { statsRoutes } from './routes/stats.js'
import { weightRoutes } from './routes/weight.js'
import { groceryRoutes } from './routes/grocery.js'
import { visionRoutes } from './routes/vision.js'
import { familyRoutes } from './routes/families.js'
import { scanRoutes } from './routes/scans.js'

declare module '@fastify/jwt' {
  /** `ver` is the users.token_version the token was signed with. */
  interface FastifyJWT {
    payload: { sub: string; email: string; ver: number }
    user: { sub: string; email: string; ver: number }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isTest
      ? // A request log per injected request buries the test output.
        false
      : env.isProd
        ? { level: 'info' }
        : {
            level: 'debug',
            transport: { target: 'pino-pretty', options: { colorize: true } },
          },
    trustProxy: true,
    bodyLimit: 1024 * 512,
  })

  await app.register(cors, {
    origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    credentials: true,
  })

  // JSON only, so the interesting parts are the transport and sniffing headers.
  // The SPA's own CSP is set by nginx, which serves the HTML.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Traefik terminates TLS; without this the API never asks for HSTS.
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  })

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '30d' },
  })

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  })

  app.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      // A signature alone only proves the token was ours once. Tokens live 30
      // days, so a changed password or a sign-out-everywhere has to be able to
      // kill the ones already out there: one indexed lookup per request buys
      // that. A token predating the bump loses.
      const [user] = await db
        .select({ tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)

      if (!user || user.tokenVersion !== (request.user.ver ?? 0)) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
    },
  )

  app.setErrorHandler((raw, request, reply) => {
    const error = raw as Error & { statusCode?: number }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        issues: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      })
    }
    const status = error.statusCode ?? 500
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed')
      // 4xx are the client's problem and would drown out the real faults.
      Sentry.captureException(error, {
        tags: { route: request.routeOptions.url ?? request.url },
      })
    }
    return reply.code(status).send({
      error: status >= 500 ? 'internal_error' : error.message,
    })
  })

  /** Liveness: the process is up and answering. Says nothing about Postgres. */
  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }))

  /**
   * Readiness: can this container actually serve requests? Docker and Dokploy
   * watch this one, so a database that is gone takes the container out of
   * rotation instead of leaving it green and failing every request.
   */
  app.get('/api/ready', async (_request, reply) => {
    try {
      await sql`select 1`
      return { ok: true, db: 'up' }
    } catch (err) {
      app.log.error({ err }, 'readiness check failed')
      return reply.code(503).send({ ok: false, db: 'down' })
    }
  })

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(profileRoutes, { prefix: '/api/profile' })
  await app.register(foodRoutes, { prefix: '/api/foods' })
  await app.register(foodImageRoutes, { prefix: '/api/foods' })
  await app.register(diaryRoutes, { prefix: '/api/diary' })
  await app.register(statsRoutes, { prefix: '/api/stats' })
  await app.register(weightRoutes, { prefix: '/api/weight' })
  await app.register(groceryRoutes, { prefix: '/api/grocery' })
  await app.register(familyRoutes, { prefix: '/api/families' })
  await app.register(scanRoutes, { prefix: '/api/scans' })
  await app.register(visionRoutes, { prefix: '/api/vision' })
  await app.register(premiumRoutes, { prefix: '/api/premium' })

  return app
}
