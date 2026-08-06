import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  families as familiesTable,
  familyMembers,
  foods,
  profiles,
  users,
  weightLogs,
} from '../db/schema.js'
import {
  ageFromBirthDate,
  dailyTargets,
  proteinRecommendation,
} from '../lib/nutrition.js'
import { verifyPassword } from '../lib/password.js'

const bodyMetrics = z.object({
  sex: z.enum(['male', 'female']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(80).max(250),
  weightKg: z.number().min(25).max(400),
  activityLevel: z.enum([
    'sedentary',
    'light',
    'moderate',
    'active',
    'very_active',
  ]),
  goal: z.enum(['lose', 'maintain', 'gain']),
  targetWeightKg: z.number().min(25).max(400).optional(),
})

const deleteBody = z.object({
  password: z.string().min(1).max(200),
})

const patchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  sex: z.enum(['male', 'female']).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  heightCm: z.number().min(80).max(250).optional(),
  targetWeightKg: z.number().min(25).max(400).optional(),
  activityLevel: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .optional(),
  goal: z.enum(['lose', 'maintain', 'gain']).optional(),
  targetKcal: z.number().int().min(800).max(8000).optional(),
  targetProteinG: z.number().int().min(0).max(600).optional(),
  targetCarbsG: z.number().int().min(0).max(1200).optional(),
  targetFatG: z.number().int().min(0).max(400).optional(),
  targetKcalMin: z.number().int().min(500).max(8000).optional(),
  targetKcalMax: z.number().int().min(500).max(9000).optional(),
  locale: z.string().max(8).optional(),
})

/**
 * Everything a target calculation needs: the stored metrics plus the most
 * recent weigh-in, which is what the user actually weighs today. Returns an
 * error code instead of throwing so both callers can map it to a 400.
 */
async function targetInputs(userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)
  if (!profile?.heightCm || !profile.birthDate) {
    return { error: 'incomplete_profile' as const }
  }

  const [latest] = await db
    .select({ weightKg: weightLogs.weightKg })
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .orderBy(desc(weightLogs.day))
    .limit(1)

  const weightKg = latest?.weightKg ?? profile.startWeightKg
  if (!weightKg) return { error: 'no_weight_logged' as const }

  return {
    error: null,
    weightKg,
    input: {
      sex: profile.sex,
      weightKg,
      heightCm: profile.heightCm,
      age: ageFromBirthDate(profile.birthDate),
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    },
  }
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request, reply) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, request.user.sub))
      .limit(1)
    if (!profile) return reply.code(404).send({ error: 'not_found' })
    return profile
  })

  /** Preview targets without persisting — used live by the onboarding sliders. */
  app.post('/estimate', async (request) => {
    const body = bodyMetrics.parse(request.body)
    return dailyTargets({
      sex: body.sex,
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      age: ageFromBirthDate(body.birthDate),
      activityLevel: body.activityLevel,
      goal: body.goal,
    })
  })

  /** Onboarding: stores metrics, computed targets and the starting weight. */
  app.post('/onboarding', async (request) => {
    const body = bodyMetrics.parse(request.body)
    const targets = dailyTargets({
      sex: body.sex,
      weightKg: body.weightKg,
      heightCm: body.heightCm,
      age: ageFromBirthDate(body.birthDate),
      activityLevel: body.activityLevel,
      goal: body.goal,
    })
    const userId = request.user.sub
    const today = new Date().toISOString().slice(0, 10)

    const profile = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(profiles)
        .set({
          sex: body.sex,
          birthDate: body.birthDate,
          heightCm: body.heightCm,
          startWeightKg: body.weightKg,
          targetWeightKg: body.targetWeightKg ?? body.weightKg,
          activityLevel: body.activityLevel,
          goal: body.goal,
          targetKcal: targets.targetKcal,
          targetProteinG: targets.targetProteinG,
          targetCarbsG: targets.targetCarbsG,
          targetFatG: targets.targetFatG,
          targetKcalMin: targets.targetKcalMin,
          targetKcalMax: targets.targetKcalMax,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId))
        .returning()

      await tx
        .insert(weightLogs)
        .values({ userId, day: today, weightKg: body.weightKg })
        .onConflictDoUpdate({
          target: [weightLogs.userId, weightLogs.day],
          set: { weightKg: body.weightKg },
        })

      return updated!
    })

    return { profile, targets }
  })

  app.patch('/', async (request) => {
    const body = patchBody.parse(request.body)
    const { name, ...profileFields } = body
    const userId = request.user.sub

    if (name) {
      await db.update(users).set({ name }).where(eq(users.id, userId))
    }

    if (Object.keys(profileFields).length === 0) {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1)
      return profile
    }

    const [profile] = await db
      .update(profiles)
      .set({ ...profileFields, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning()
    return profile
  })

  /**
   * Deletes the account and everything attached to it. Irreversible, and asks
   * for the password because a stolen token must not be able to do this.
   *
   * Most of the work is done by `on delete cascade`: profile, diary, weights,
   * favourites, grocery rows, family memberships and the scan feed all go with
   * the user row. Three things need doing by hand:
   *
   *  - custom foods the user authored, which the schema would only orphan
   *    (`created_by` set null). Other people's diary entries keep working: they
   *    carry a name snapshot and their `food_id` goes null.
   *  - families left without a single member, which nobody could ever reach.
   *  - Open Food Facts and generic foods stay: they are not the user's data.
   */
  app.delete('/', async (request, reply) => {
    const { password } = deleteBody.parse(request.body)
    const userId = request.user.sub

    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return reply.code(404).send({ error: 'not_found' })

    if (!(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    await db.transaction(async (tx) => {
      const authored = await tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(eq(foods.createdBy, userId), eq(foods.source, 'custom')))

      const families = await tx
        .select({ familyId: familyMembers.familyId })
        .from(familyMembers)
        .where(eq(familyMembers.userId, userId))

      await tx.delete(users).where(eq(users.id, userId))

      if (authored.length > 0) {
        await tx.delete(foods).where(
          inArray(
            foods.id,
            authored.map((f) => f.id),
          ),
        )
      }

      for (const { familyId } of families) {
        const [remaining] = await tx
          .select({ userId: familyMembers.userId })
          .from(familyMembers)
          .where(eq(familyMembers.familyId, familyId))
          .limit(1)
        if (!remaining) {
          await tx.delete(familiesTable).where(eq(familiesTable.id, familyId))
        }
      }
    })

    request.log.info({ userId }, 'account deleted')
    return reply.code(204).send()
  })

  /**
   * What the standard formulas would give this profile right now, without
   * touching the stored targets — the settings screen shows it next to the
   * fields the user has edited by hand.
   */
  app.get('/suggested', async (request, reply) => {
    const ctx = await targetInputs(request.user.sub)
    if (ctx.error) return reply.code(400).send({ error: ctx.error })

    const protein = proteinRecommendation(ctx.input)
    return {
      weightKg: ctx.weightKg,
      targets: dailyTargets(ctx.input),
      proteinPerKg: protein.perKg,
      leanBodyMassKg: protein.lbmKg,
    }
  })

  /** Recomputes targets from the stored metrics and the latest weigh-in. */
  app.post('/recalculate', async (request, reply) => {
    const userId = request.user.sub
    const ctx = await targetInputs(userId)
    if (ctx.error) return reply.code(400).send({ error: ctx.error })

    const { maintenanceKcal, ...targets } = dailyTargets(ctx.input)

    const [updated] = await db
      .update(profiles)
      .set({ ...targets, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning()

    return { profile: updated, targets: { ...targets, maintenanceKcal } }
  })
}
