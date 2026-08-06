import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db, type Db } from '../db/index.js'
import { familyMembers, groceryItems, profiles } from '../db/schema.js'

/**
 * Sharing lives here rather than in each handler. Ownership everywhere else in
 * this API is a hand-written `eq(table.userId, request.user.sub)`, which is
 * fine while a row has exactly one owner — a shared list does not, so the
 * visibility rule is centralised to keep it from drifting between routes.
 */

type Client = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** Every family the user belongs to. Empty array means "solo". */
export async function getFamilyIds(
  userId: string,
  client: Client = db,
): Promise<string[]> {
  const rows = await client
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
  return rows.map((r) => r.familyId)
}

/**
 * Which list a new shared row lands in. Reads are merged across every family,
 * but a write needs one target: the active family if it is still valid, else
 * the only family the user has, else private.
 */
export async function resolveWriteFamilyId(
  userId: string,
  client: Client = db,
): Promise<string | null> {
  const familyIds = await getFamilyIds(userId, client)
  if (familyIds.length === 0) return null

  const [profile] = await client
    .select({ activeFamilyId: profiles.activeFamilyId })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  const active = profile?.activeFamilyId
  if (active && familyIds.includes(active)) return active
  return familyIds[0]!
}

/** Rows the user may see: any of their families' rows, plus their own private ones. */
export function groceryVisibility(userId: string, familyIds: string[]): SQL {
  const own = and(
    isNull(groceryItems.familyId),
    eq(groceryItems.userId, userId),
  )!
  // `inArray` with an empty list generates `in ()`, which is invalid SQL.
  if (familyIds.length === 0) return own
  return or(inArray(groceryItems.familyId, familyIds), own)!
}

export class HttpError extends Error {
  statusCode: number
  constructor(statusCode: number, code: string) {
    super(code)
    this.statusCode = statusCode
  }
}

/** Throws 403 unless the user is in the family. Members are all equal. */
export async function assertMember(
  userId: string,
  familyId: string,
  client: Client = db,
): Promise<void> {
  const [row] = await client
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
      ),
    )
    .limit(1)
  if (!row) throw new HttpError(403, 'not_a_member')
}

/**
 * Only one active row per (list, dedupeKey) is allowed, so before moving rows
 * between lists their duplicates have to be folded together — the same merge
 * the restore path in `routes/grocery.ts` performs. Quantities are summed into
 * the destination row and the source row is dropped.
 */
async function foldActiveDuplicates(
  client: Client,
  source: SQL,
  destination: SQL,
): Promise<void> {
  await client.execute(sql`
    with src as (
      select id, dedupe_key, quantity from ${groceryItems}
      where ${source} and completed = false
    ),
    dest as (
      select id, dedupe_key from ${groceryItems}
      where ${destination} and completed = false
    ),
    dupes as (
      select src.id as src_id, dest.id as dest_id, src.quantity
      from src join dest on dest.dedupe_key = src.dedupe_key
    ),
    merged as (
      update ${groceryItems} g
      set quantity = least(999, g.quantity + dupes.quantity), updated_at = now()
      from dupes where g.id = dupes.dest_id
      returning dupes.src_id
    )
    delete from ${groceryItems} where id in (select src_id from merged)
  `)
}

/** Moves the user's private grocery rows into a family they just joined. */
export async function movePrivateItemsIntoFamily(
  userId: string,
  familyId: string,
  client: Client,
): Promise<void> {
  const isPrivate = and(
    eq(groceryItems.userId, userId),
    isNull(groceryItems.familyId),
  )!
  await foldActiveDuplicates(
    client,
    isPrivate,
    eq(groceryItems.familyId, familyId),
  )
  await client
    .update(groceryItems)
    .set({ familyId, updatedAt: new Date() })
    .where(isPrivate)
}

/**
 * The reverse, for the last member leaving: the family row is about to be
 * deleted and would cascade its items away, so hand the list back as private.
 */
export async function reclaimFamilyItems(
  userId: string,
  familyId: string,
  client: Client,
): Promise<void> {
  const isFamily = eq(groceryItems.familyId, familyId)
  await foldActiveDuplicates(
    client,
    isFamily,
    and(eq(groceryItems.userId, userId), isNull(groceryItems.familyId))!,
  )
  await client
    .update(groceryItems)
    .set({ familyId: null, userId, updatedAt: new Date() })
    .where(isFamily)
}
