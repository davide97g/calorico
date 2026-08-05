import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { getVisionProvider } from '../lib/vision/index.js'
import { matchAnalysis } from '../lib/vision/match.js'

const ACCEPTED = new Set(['image/webp', 'image/jpeg', 'image/png'])

const analyzeBody = z.object({
  /** Raw base64, no data-URI prefix — the client strips it. */
  image: z.string().min(32),
  contentType: z.string().max(60),
})

/** base64 carries 3 bytes per 4 characters, minus the padding. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

const maxImageBytes = env.vision?.maxImageBytes ?? 1024 * 1024

/**
 * Sized so the image check below is what rejects an oversized photo, not
 * Fastify's body limit: base64 inflates by 4/3, so a limit set to the image
 * size would always trip first and answer with a generic message instead of
 * `image_too_large`. Fastify still backstops anything past this.
 */
const BODY_LIMIT = Math.ceil(maxImageBytes * (4 / 3)) + 4096

export const visionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /** Lets the client hide the camera button instead of offering a dead end. */
  app.get('/status', async () => ({ enabled: getVisionProvider() !== null }))

  app.post(
    '/meal',
    {
      // Per-route: a compressed photo is ~667 KB once base64'd, well over the
      // app-wide 512 KB limit, which stays where it is for every other route.
      bodyLimit: BODY_LIMIT,
      // Every call costs money. The global 300/min is a denial-of-service
      // guard, not a spend control.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const provider = getVisionProvider()
      if (!provider) return reply.code(503).send({ error: 'vision_disabled' })

      const body = analyzeBody.parse(request.body)

      if (!ACCEPTED.has(body.contentType))
        return reply.code(415).send({ error: 'unsupported_media_type' })

      if (decodedBytes(body.image) > maxImageBytes)
        return reply.code(413).send({ error: 'image_too_large' })

      let analysis
      try {
        // Deliberately not logging the image, here or anywhere downstream.
        analysis = await provider.analyzeMeal({
          base64: body.image,
          contentType: body.contentType,
        })
      } catch (err) {
        request.log.error({ err, provider: provider.name }, 'vision analysis failed')
        return reply.code(502).send({ error: 'vision_unavailable' })
      }

      if (analysis.items.length === 0)
        return reply.code(422).send({ error: 'no_food_detected' })

      return matchAnalysis(analysis, request.log)
    },
  )
}
