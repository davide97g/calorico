import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, count, eq, gt, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { adminDb, db } from '../db/index.js'
import {
  families,
  familyInvites,
  familyMembers,
  profiles,
  scanEvents,
  users,
} from '../db/schema.js'
import {
  assertMember,
  getFamilyIds,
  HttpError,
  movePrivateItemsIntoFamily,
  reclaimFamilyItems,
} from '../lib/family.js'
import { idParam } from '../lib/validation.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const nameBody = z.object({ name: z.string().trim().min(1).max(60) })
const tokenParam = z.object({ token: z.string().min(8).max(120) })

function newToken() {
  return randomBytes(24).toString('base64url')
}

type MemberRow = {
  familyId: string
  joinedAt: Date
  id: string
  name: string
  avatarUrl: string | null
}

/** Members of every family in one query, so the list endpoint stays a 2-query call. */
async function membersOf(familyIds: string[]): Promise<Map<string, MemberRow[]>> {
  if (familyIds.length === 0) return new Map()
  const rows = await db
    .select({
      familyId: familyMembers.familyId,
      joinedAt: familyMembers.joinedAt,
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(inArray(familyMembers.familyId, familyIds))
    .orderBy(asc(familyMembers.joinedAt))

  const byFamily = new Map<string, MemberRow[]>()
  for (const row of rows) {
    const list = byFamily.get(row.familyId) ?? []
    list.push(row)
    byFamily.set(row.familyId, list)
  }
  return byFamily
}

export const familyRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Public on purpose: an invite link is normally opened by someone who is not
   * signed in yet, and the join screen has to be able to name the family
   * before asking them to create an account.
   */
  app.get('/invites/:token', async (request, reply) => {
    const { token } = tokenParam.parse(request.params)

    const [invite] = await adminDb
      .select({
        id: familyInvites.id,
        familyId: familyInvites.familyId,
        familyName: families.name,
        expiresAt: familyInvites.expiresAt,
      })
      .from(familyInvites)
      .innerJoin(families, eq(families.id, familyInvites.familyId))
      .where(
        and(
          eq(familyInvites.token, token),
          isNull(familyInvites.revokedAt),
          gt(familyInvites.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (!invite) return reply.code(404).send({ error: 'invite_not_found' })

    const [members] = await adminDb
      .select({ value: count() })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, invite.familyId))

    // Optional auth: a signed-in visitor gets told they are already in.
    let alreadyMember = false
    try {
      await request.jwtVerify()
      alreadyMember = (await getFamilyIds(request.user.sub)).includes(
        invite.familyId,
      )
    } catch {
      // Anonymous visitor — nothing to check.
    }

    return { ...invite, memberCount: members?.value ?? 0, alreadyMember }
  })

  await app.register(secureFamilyRoutes)
}

const secureFamilyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const userId = request.user.sub
    const rows = await db
      .select({
        id: families.id,
        name: families.name,
        createdAt: families.createdAt,
        joinedAt: familyMembers.joinedAt,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(eq(familyMembers.userId, userId))
      .orderBy(asc(familyMembers.joinedAt))

    const byFamily = await membersOf(rows.map((r) => r.id))

    const [profile] = await db
      .select({ activeFamilyId: profiles.activeFamilyId })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)

    return {
      families: rows.map((row) => ({
        ...row,
        members: (byFamily.get(row.id) ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          avatarUrl: m.avatarUrl,
          joinedAt: m.joinedAt,
        })),
      })),
      activeFamilyId: profile?.activeFamilyId ?? null,
    }
  })

  app.post('/', async (request, reply) => {
    const body = nameBody.parse(request.body)
    const userId = request.user.sub

    const family = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(families)
        .values({ name: body.name, createdBy: userId })
        .returning()

      await tx
        .insert(familyMembers)
        .values({ familyId: created!.id, userId })

      // The list the user already had becomes the family's starting list.
      await movePrivateItemsIntoFamily(userId, created!.id, tx)

      await tx
        .update(profiles)
        .set({ activeFamilyId: created!.id, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))

      return created!
    })

    return reply.code(201).send(family)
  })

  app.patch('/:id', async (request) => {
    const { id } = idParam.parse(request.params)
    const body = nameBody.parse(request.body)
    await assertMember(request.user.sub, id)

    const [updated] = await db
      .update(families)
      .set({ name: body.name })
      .where(eq(families.id, id))
      .returning()

    return updated
  })

  /** Which family new shared rows land in, for a user in more than one. */
  app.post('/:id/active', async (request) => {
    const { id } = idParam.parse(request.params)
    await assertMember(request.user.sub, id)

    await db
      .update(profiles)
      .set({ activeFamilyId: id, updatedAt: new Date() })
      .where(eq(profiles.userId, request.user.sub))

    return { activeFamilyId: id }
  })

  app.get('/:id/invites', async (request) => {
    const { id } = idParam.parse(request.params)
    await assertMember(request.user.sub, id)

    const [invite] = await db
      .select()
      .from(familyInvites)
      .where(
        and(
          eq(familyInvites.familyId, id),
          isNull(familyInvites.revokedAt),
          gt(familyInvites.expiresAt, new Date()),
        ),
      )
      .limit(1)

    return { invite: invite ?? null }
  })

  /** Rotating the link revokes the previous one, so only one is ever live. */
  app.post('/:id/invites', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    await assertMember(userId, id)

    const invite = await db.transaction(async (tx) => {
      await tx
        .update(familyInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(familyInvites.familyId, id), isNull(familyInvites.revokedAt)),
        )

      const [created] = await tx
        .insert(familyInvites)
        .values({
          familyId: id,
          token: newToken(),
          createdBy: userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning()

      return created!
    })

    return reply.code(201).send(invite)
  })

  app.delete('/:id/invites/:inviteId', async (request, reply) => {
    const { id, inviteId } = z
      .object({ id: z.string().uuid(), inviteId: z.string().uuid() })
      .parse(request.params)
    await assertMember(request.user.sub, id)

    await db
      .update(familyInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(familyInvites.id, inviteId), eq(familyInvites.familyId, id)),
      )

    return reply.code(204).send()
  })

  app.post('/invites/:token/accept', async (request) => {
    const { token } = tokenParam.parse(request.params)
    const userId = request.user.sub

    return adminDb.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(familyInvites)
        .where(
          and(
            eq(familyInvites.token, token),
            isNull(familyInvites.revokedAt),
            gt(familyInvites.expiresAt, new Date()),
          ),
        )
        .limit(1)

      if (!invite) throw new HttpError(404, 'invite_not_found')

      const [existing] = await tx
        .select({ userId: familyMembers.userId })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.familyId, invite.familyId),
            eq(familyMembers.userId, userId),
          ),
        )
        .limit(1)

      if (!existing) {
        await tx
          .insert(familyMembers)
          .values({ familyId: invite.familyId, userId })
        await movePrivateItemsIntoFamily(userId, invite.familyId, tx)
      }

      await tx
        .update(profiles)
        .set({ activeFamilyId: invite.familyId, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))

      return { familyId: invite.familyId, joined: !existing }
    })
  })

  app.delete('/:id/members/me', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    await assertMember(userId, id)

    await db.transaction(async (tx) => {
      await tx
        .update(scanEvents)
        .set({ familyId: null })
        .where(
          and(eq(scanEvents.userId, userId), eq(scanEvents.familyId, id)),
        )

      const [members] = await tx
        .select({ value: count() })
        .from(familyMembers)
        .where(eq(familyMembers.familyId, id))

      if ((members?.value ?? 0) <= 1) {
        // Last member: hand the list back, then drop the family (membership
        // cascades). Count first — after leaving, RLS would hide the others.
        await reclaimFamilyItems(userId, id, tx)
        await tx.delete(families).where(eq(families.id, id))
      } else {
        await tx
          .delete(familyMembers)
          .where(
            and(
              eq(familyMembers.familyId, id),
              eq(familyMembers.userId, userId),
            ),
          )
      }

      // `profiles.active_family_id` is ON DELETE SET NULL, but the family may
      // still exist with other members in it — clear the leaver's pointer too.
      await tx
        .update(profiles)
        .set({ activeFamilyId: null, updatedAt: new Date() })
        .where(
          and(eq(profiles.userId, userId), eq(profiles.activeFamilyId, id)),
        )
    })

    return reply.code(204).send()
  })
}
