import type { FastifyPluginAsync } from 'fastify'
import { and, asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { adminDb, db } from '../db/index.js'
import { profiles, pushSubscriptions, reminders } from '../db/schema.js'
import { env } from '../env.js'
import { pushConfigured } from '../lib/push/send.js'
import { deliver } from '../lib/reminders/scheduler.js'
import { EVERY_DAY, REMINDER_PRESETS } from '../lib/reminders/presets.js'
import { idParam, mealSlot } from '../lib/validation.js'

/**
 * Reminders and the devices they are delivered to.
 *
 * The client is told three things it cannot work out for itself: whether the
 * server has VAPID keys at all (`push.supported`), the public key it needs to
 * subscribe, and the suggested reminders. That last one lives here rather than
 * in the browser so the labels the scheduler sends and the labels the settings
 * screen offers cannot drift apart.
 */

/** Postgres and the browser both accept IANA names; Intl is the cheap check. */
function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const kindEnum = z.enum(['meal', 'review', 'weight', 'custom'])

const settingsBody = z.object({
  enabled: z.boolean().optional(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, 'unknown timezone')
    .optional(),
})

/**
 * The web build a browser is running. Opaque to the server — it is only ever
 * compared for equality with what the deployment publishes — so the shape is
 * checked to keep junk out of the column, not to be understood.
 */
const buildId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'unexpected build id')

const subscribeBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  userAgent: z.string().max(300).optional(),
  buildId: buildId.optional(),
})

const versionBody = z.object({
  endpoint: z.string().url().max(1000),
  buildId,
})

const unsubscribeBody = z.object({
  endpoint: z.string().url().max(1000),
})

const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'pick at least one day')
  .max(7)
  // A duplicate day would fire twice on the same `= any(weekdays)` match.
  .transform((days) => [...new Set(days)].toSorted((a, b) => a - b))

const createBody = z.object({
  kind: kindEnum.default('custom'),
  meal: mealSlot.nullish(),
  label: z.string().trim().min(1).max(60),
  atMinutes: z.number().int().min(0).max(1439),
  weekdays: weekdays.default(EVERY_DAY),
  skipIfLogged: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

const patchBody = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  atMinutes: z.number().int().min(0).max(1439).optional(),
  weekdays: weekdays.optional(),
  skipIfLogged: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

/**
 * `meal` only means something for a meal reminder, and `skipIfLogged` only means
 * something when there is a way to tell the thing was done — a free-text
 * reminder has none, so it always fires.
 */
function normalise<T extends { kind: 'meal' | 'review' | 'weight' | 'custom' }>(
  input: T & { meal?: string | null; skipIfLogged?: boolean },
) {
  return {
    ...input,
    meal: input.kind === 'meal' ? (input.meal ?? null) : null,
    skipIfLogged: input.kind === 'custom' ? false : (input.skipIfLogged ?? true),
  }
}

const reminderColumns = {
  id: reminders.id,
  kind: reminders.kind,
  meal: reminders.meal,
  label: reminders.label,
  atMinutes: reminders.atMinutes,
  weekdays: reminders.weekdays,
  skipIfLogged: reminders.skipIfLogged,
  enabled: reminders.enabled,
  lastSentOn: reminders.lastSentOn,
  lastSentAt: reminders.lastSentAt,
  createdAt: reminders.createdAt,
}

function listReminders(userId: string) {
  return db
    .select(reminderColumns)
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.atMinutes), asc(reminders.createdAt))
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const userId = request.user.sub

    const [profile] = await db
      .select({
        enabled: profiles.notificationsEnabled,
        timezone: profiles.timezone,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)

    const [devices] = await db
      .select({ value: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))

    return {
      push: {
        supported: pushConfigured(),
        publicKey: env.push?.publicKey ?? null,
      },
      enabled: profile?.enabled ?? false,
      timezone: profile?.timezone ?? 'Europe/Rome',
      /** How many browsers are registered. Zero means nothing can arrive. */
      devices: devices?.value ?? 0,
      maxReminders: env.MAX_REMINDERS_PER_USER,
      presets: REMINDER_PRESETS,
      reminders: await listReminders(userId),
    }
  })

  /**
   * The master switch and the zone reminders are read in. The browser sends its
   * own zone whenever it turns notifications on, which is the only moment we can
   * learn it — see the comment on `profiles.timezone`.
   */
  app.patch('/', async (request, reply) => {
    const body = settingsBody.parse(request.body)
    const userId = request.user.sub

    if (body.enabled && !pushConfigured()) {
      return reply.code(503).send({ error: 'push_disabled' })
    }

    // Spread out by hand: the API calls it `enabled`, the column is
    // `notifications_enabled`, and drizzle drops keys it does not recognise
    // instead of complaining.
    const [updated] = await db
      .update(profiles)
      .set({
        ...(body.enabled === undefined
          ? {}
          : { notificationsEnabled: body.enabled }),
        ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId))
      .returning({
        enabled: profiles.notificationsEnabled,
        timezone: profiles.timezone,
      })

    if (!updated) return reply.code(404).send({ error: 'not_found' })
    return updated
  })

  /**
   * Registers this browser. Upsert on the endpoint rather than on the user: the
   * endpoint is the push service's own name for that browser, so a re-subscribe
   * has to update the row, and a phone that changed account has to move to it.
   */
  app.post('/subscribe', async (request, reply) => {
    if (!pushConfigured()) {
      return reply.code(503).send({ error: 'push_disabled' })
    }

    const body = subscribeBody.parse(request.body)
    const userId = request.user.sub

    await adminDb
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? request.headers['user-agent'] ?? null,
        buildId: body.buildId ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent ?? request.headers['user-agent'] ?? null,
          buildId: body.buildId ?? null,
        },
      })

    const [devices] = await db
      .select({ value: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))

    return reply.code(201).send({ devices: devices?.value ?? 1 })
  })

  /** Called when the browser drops its subscription, or on sign-out. */
  app.delete('/subscribe', async (request, reply) => {
    const { endpoint } = unsubscribeBody.parse(request.body)

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, request.user.sub),
        ),
      )

    return reply.code(204).send()
  })

  /**
   * Records which build this device is on, once per session.
   *
   * It is what stops the "new version available" push going to a device that
   * already has it: the notifier only sends to subscriptions whose build is not
   * the deployed one. Nothing here can trigger a notification — the deployed
   * build is read from the web container, never from a client — so an endpoint
   * this account does not own simply matches no row, and the answer is the same
   * 204 either way rather than a probe into whose device is whose.
   */
  app.post(
    '/version',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = versionBody.parse(request.body)

      await db
        .update(pushSubscriptions)
        .set({ buildId: body.buildId })
        .where(
          and(
            eq(pushSubscriptions.endpoint, body.endpoint),
            eq(pushSubscriptions.userId, request.user.sub),
          ),
        )

      return reply.code(204).send()
    },
  )

  app.post('/reminders', async (request, reply) => {
    const body = normalise(createBody.parse(request.body))
    const userId = request.user.sub

    const [existing] = await db
      .select({ value: count() })
      .from(reminders)
      .where(eq(reminders.userId, userId))

    if ((existing?.value ?? 0) >= env.MAX_REMINDERS_PER_USER) {
      return reply.code(409).send({ error: 'too_many_reminders' })
    }

    const [created] = await db
      .insert(reminders)
      .values({ ...body, userId })
      .returning(reminderColumns)

    return reply.code(201).send(created)
  })

  /**
   * Creates the suggested set, skipping anything the user already has at the
   * same kind, meal and time — so tapping it twice does not double every
   * reminder, and a set that was partly deleted can be topped up.
   */
  app.post('/reminders/defaults', async (request) => {
    const userId = request.user.sub
    const existing = await listReminders(userId)

    const taken = new Set(
      existing.map((r) => `${r.kind}:${r.meal ?? ''}:${r.atMinutes}`),
    )
    const room = env.MAX_REMINDERS_PER_USER - existing.length

    const missing = REMINDER_PRESETS.filter(
      (preset) =>
        !taken.has(`${preset.kind}:${preset.meal ?? ''}:${preset.atMinutes}`),
    ).slice(0, Math.max(0, room))

    if (missing.length > 0) {
      await db.insert(reminders).values(
        missing.map((preset) => ({
          userId,
          kind: preset.kind,
          meal: preset.meal,
          label: preset.label,
          atMinutes: preset.atMinutes,
          weekdays: preset.weekdays,
          skipIfLogged: preset.skipIfLogged,
        })),
      )
    }

    return { created: missing.length, reminders: await listReminders(userId) }
  })

  app.patch('/reminders/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = patchBody.parse(request.body)

    const [updated] = await db
      .update(reminders)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(reminders.id, id), eq(reminders.userId, request.user.sub)))
      .returning(reminderColumns)

    if (!updated) return reply.code(404).send({ error: 'reminder_not_found' })
    return updated
  })

  app.delete('/reminders/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)

    const [deleted] = await db
      .delete(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, request.user.sub)))
      .returning({ id: reminders.id })

    if (!deleted) return reply.code(404).send({ error: 'reminder_not_found' })
    return reply.code(204).send()
  })

  /**
   * Sends one notification right now. The only way to find out whether a phone
   * will actually show these — iOS in particular only delivers to a PWA that was
   * installed to the home screen, and nothing on the settings screen can tell.
   */
  app.post(
    '/test',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!pushConfigured()) {
        return reply.code(503).send({ error: 'push_disabled' })
      }

      const { sent, removed, failed } = await deliver(request.user.sub, {
        title: 'Calorico',
        body: 'Le notifiche funzionano. I promemoria arriveranno così.',
        url: '/notifications',
        tag: 'reminder-test',
      })

      // Two different silences, and the client says something different about
      // each: no device on the account at all, or a device the push service
      // refused to deliver to — which is what wrong VAPID keys look like from
      // here, and the one case where the fix is on the server.
      if (sent === 0) {
        if (failed > 0) {
          request.log.warn(
            { userId: request.user.sub, failed, removed },
            'push: test notification refused by the push service',
          )
          return reply.code(502).send({ error: 'push_failed' })
        }
        return reply.code(409).send({ error: 'no_devices' })
      }
      return { sent, removed }
    },
  )
}
