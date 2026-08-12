import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { getVisionProvider } from '../lib/vision/index.js'
import { matchAnalysis } from '../lib/vision/match.js'
import { recordScan } from '../lib/scan-log.js'
import {
  claimFreePhotoScan,
  photoQuota,
  releaseFreePhotoScan,
} from '../lib/premium.js'

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

  /**
   * Lets the client hide the camera button instead of offering a dead end, and
   * show what is left of the free allowance before the photo is taken.
   */
  app.get('/status', async (request) => ({
    enabled: getVisionProvider() !== null,
    quota: await photoQuota(request.user.sub),
  }))

  app.post(
    '/meal',
    {
      // Per-route: a compressed photo is ~667 KB once base64'd, well over the
      // app-wide 512 KB limit, which stays where it is for every other route.
      bodyLimit: BODY_LIMIT,
      // Every call costs money. The global 300/min is a denial-of-service
      // guard, not a spend control.
      config: {
        rateLimit: { max: env.VISION_MAX_PER_MINUTE, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const provider = getVisionProvider()
      if (!provider) return reply.code(503).send({ error: 'vision_disabled' })

      const body = analyzeBody.parse(request.body)

      if (!ACCEPTED.has(body.contentType))
        return reply.code(415).send({ error: 'unsupported_media_type' })

      if (decodedBytes(body.image) > maxImageBytes)
        return reply.code(413).send({ error: 'image_too_large' })

      // Claimed after the cheap validation and before the provider is paid: the
      // rate limit above bounds bursts, this bounds the bill. Taking the free
      // photo up front rather than counting it afterwards is what makes two
      // simultaneous uploads cost the allowance twice instead of once.
      if (!(await claimFreePhotoScan(request.user.sub))) {
        const quota = await photoQuota(request.user.sub)
        return reply.code(402).send({
          error: 'photo_quota_exceeded',
          used: quota.used,
          limit: quota.limit,
        })
      }

      let analysis
      try {
        // Deliberately not logging the image, here or anywhere downstream.
        analysis = await provider.analyzeMeal({
          base64: body.image,
          contentType: body.contentType,
        })
      } catch (err) {
        request.log.error({ err, provider: provider.name }, 'vision analysis failed')
        // Our outage, not their photo: give the allowance back.
        await releaseFreePhotoScan(request.user.sub)
        return reply.code(502).send({ error: 'vision_unavailable' })
      }

      // A plate we could not read still cost a provider call, but charging the
      // single free analysis for "no ho riconosciuto cibo" reads as a con.
      if (analysis.items.length === 0) {
        await releaseFreePhotoScan(request.user.sub)
        return reply.code(422).send({ error: 'no_food_detected' })
      }

      // Labels and portions only — the photo stays unstored, as above.
      await recordScan(
        request.user.sub,
        {
          kind: 'photo',
          nameSnapshot: analysis.items.map((i) => i.label).join(', '),
          items: analysis.items.map((i) => ({
            label: i.label,
            quantityG: i.quantityG,
          })),
        },
        request.log,
      )

      return matchAnalysis(analysis, request.log, request.user.sub)
    },
  )
}
