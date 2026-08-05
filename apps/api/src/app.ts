import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import { env } from './env.js'
import { authRoutes } from './routes/auth.js'
import { profileRoutes } from './routes/profile.js'
import { foodRoutes } from './routes/foods.js'
import { foodImageRoutes } from './routes/food-images.js'
import { diaryRoutes } from './routes/diary.js'
import { statsRoutes } from './routes/stats.js'
import { weightRoutes } from './routes/weight.js'
import { groceryRoutes } from './routes/grocery.js'
import { visionRoutes } from './routes/vision.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string }
    user: { sub: string; email: string }
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
    logger: env.isProd
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
    if (status >= 500) request.log.error({ err: error }, 'request failed')
    return reply.code(status).send({
      error: status >= 500 ? 'internal_error' : error.message,
    })
  })

  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(profileRoutes, { prefix: '/api/profile' })
  await app.register(foodRoutes, { prefix: '/api/foods' })
  await app.register(foodImageRoutes, { prefix: '/api/foods' })
  await app.register(diaryRoutes, { prefix: '/api/diary' })
  await app.register(statsRoutes, { prefix: '/api/stats' })
  await app.register(weightRoutes, { prefix: '/api/weight' })
  await app.register(groceryRoutes, { prefix: '/api/grocery' })
  await app.register(visionRoutes, { prefix: '/api/vision' })

  return app
}
