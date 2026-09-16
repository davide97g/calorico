import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { foods, groceryItems, pantryItems } from '../db/schema.js'
import { getFamilyIds, resolveWriteFamilyId } from './family.js'
import { env } from '../env.js'

/**
 * The cupboard, and the rule that turns it into a shopping list.
 *
 * A tracked product is stocked in packages. Eating it takes grams off the
 * stock; the moment what is left drops to the last portion, the product writes
 * itself onto the shopping list and marks itself as having done so. That mark
 * is the whole reason this is not a trigger: without it every subsequent
 * spoonful would put the row back, including the one a user had just deleted
 * on purpose.
 *
 * Nothing here ever creates a pantry row implicitly. Stocking is a deliberate
 * act, per product, because the alternative has already been tried and undone —
 * the app used to add every scanned barcode to the shopping list and the list
 * filled with everything anyone had ever picked up.
 */

type Client = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** Two counts and a package size; the shape every calculation below works on. */
export interface Stock {
  sealedPackages: number
  remainingG: number
  packageSizeG: number
}

/** More than anyone stocks, and a bound on a typo in the packages field. */
const MAX_PACKAGES = 99

/** Grams carry one decimal here, for the same reason macros do. */
const round = (n: number) => Math.round(n * 10) / 10

/** Everything in the cupboard, open package included. */
export function totalG(stock: Stock): number {
  return round(stock.sealedPackages * stock.packageSizeG + stock.remainingG)
}

/**
 * Puts a total back into a sealed count and an open package.
 *
 * The `- 1` is what keeps a full package open rather than sealed: 400 g of a
 * 400 g jar is one jar being eaten, not one jar untouched and nothing to eat.
 * The epsilon is against the float that `real` hands back — 400.00000001 g
 * would otherwise round up into a second package that does not exist.
 */
function normalise(total: number, packageSizeG: number): Stock {
  const clamped = Math.max(0, round(total))
  const sealed = Math.min(
    MAX_PACKAGES,
    Math.max(0, Math.ceil(clamped / packageSizeG - 1e-9) - 1),
  )
  return {
    sealedPackages: sealed,
    remainingG: round(clamped - sealed * packageSizeG),
    packageSizeG,
  }
}

/**
 * Takes `consumedG` out of the cupboard. A negative amount puts it back, which
 * is what an edited or deleted diary entry does: correcting a mistyped 300 g
 * must not drain the jar for good.
 */
export function applyDelta(stock: Stock, consumedG: number): Stock {
  return normalise(totalG(stock) - consumedG, stock.packageSizeG)
}

/** Whether what is left is down to the last portion of a package. */
export function isLow(stock: Stock, fraction = env.PANTRY_LOW_FRACTION): boolean {
  return totalG(stock) <= stock.packageSizeG * fraction
}

/** How many packages are left, open one counted as the fraction it is. */
export function packagesLeft(stock: Stock): number {
  return Math.round((totalG(stock) / stock.packageSizeG) * 100) / 100
}

/** Rows the user may see: their families' pantries, plus their own private one. */
export function pantryVisibility(userId: string, familyIds: string[]): SQL {
  const own = and(isNull(pantryItems.familyId), eq(pantryItems.userId, userId))!
  // `inArray` with an empty list generates `in ()`, which is invalid SQL.
  if (familyIds.length === 0) return own
  return or(inArray(pantryItems.familyId, familyIds), own)!
}

/**
 * Writes the low-stock row onto the shopping list, once per package cycle.
 *
 * `onConflictDoNothing` rather than the quantity bump the manual add does: the
 * product is already on somebody's list, and a cupboard running low is not a
 * reason to buy two.
 */
async function addLowStockRow(
  client: Client,
  item: { userId: string; familyId: string | null; foodId: string },
): Promise<void> {
  const [food] = await client
    .select({ name: foods.name, brand: foods.brand })
    .from(foods)
    .where(eq(foods.id, item.foodId))
    .limit(1)
  if (!food) return

  await client
    .insert(groceryItems)
    .values({
      userId: item.userId,
      familyId: item.familyId,
      foodId: item.foodId,
      dedupeKey: `food:${item.foodId}`,
      nameSnapshot: food.name,
      brandSnapshot: food.brand,
      quantity: 1,
      category: 'food',
      source: 'auto',
    })
    .onConflictDoNothing()
}

/**
 * Moves a tracked product's stock and, if that takes it below the line, puts it
 * on the shopping list.
 *
 * Silently does nothing when the food is not stocked, which is the common case:
 * most of what gets eaten is not something the household keeps a cupboard count
 * of. Callers pass their own transaction so the diary row and the stock it
 * spends are written together or not at all.
 */
export async function applyPantryDelta(
  client: Client,
  userId: string,
  foodId: string,
  consumedG: number,
): Promise<void> {
  if (consumedG === 0) return

  const familyId = await resolveWriteFamilyId(userId, client)
  const listId = familyId ?? userId

  const [existing] = await client
    .select()
    .from(pantryItems)
    .where(and(eq(pantryItems.listId, listId), eq(pantryItems.foodId, foodId)))
    .limit(1)
  if (!existing) return

  await writeStock(client, existing, applyDelta(existing, consumedG))
}

/**
 * Stores a new stock level and, on the way past the line, writes the shopping
 * row. Every path that moves stock goes through here — the diary, a restock, a
 * correction by hand — so the one-add-per-cycle rule is stated once.
 */
export async function writeStock(
  client: Client,
  existing: typeof pantryItems.$inferSelect,
  next: Stock,
): Promise<void> {
  const low = isLow(next)
  // Falling edge only. Rising back above the line is what re-arms the add, so a
  // restock — or an edit that hands grams back — makes the next run-down count.
  const shouldAdd = low && existing.lowNotifiedAt === null

  await client
    .update(pantryItems)
    .set({
      sealedPackages: next.sealedPackages,
      remainingG: next.remainingG,
      packageSizeG: next.packageSizeG,
      lowNotifiedAt: low ? (existing.lowNotifiedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(pantryItems.id, existing.id))

  if (shouldAdd) {
    await addLowStockRow(client, {
      userId: existing.userId,
      familyId: existing.familyId,
      foodId: existing.foodId,
    })
  }
}

/**
 * Puts packages in the cupboard, creating the row if this is the first time.
 *
 * `packageSizeG` is only read from the catalogue when it has one. Roughly three
 * Tosano products in four carry no nutrition table and no package size, so the
 * caller is allowed to supply it — otherwise the supermarket's own label, which
 * is exactly what a household buys every week, could never be tracked.
 */
export async function stockPantryItem(
  client: Client,
  userId: string,
  input: { foodId: string; packages: number; packageSizeG?: number },
): Promise<{ ok: true } | { ok: false; error: 'food_not_found' | 'package_size_required' }> {
  const [food] = await client
    .select({ id: foods.id, packageSizeG: foods.packageSizeG })
    .from(foods)
    .where(eq(foods.id, input.foodId))
    .limit(1)
  if (!food) return { ok: false, error: 'food_not_found' }

  const familyId = await resolveWriteFamilyId(userId, client)
  const listId = familyId ?? userId

  const [existing] = await client
    .select()
    .from(pantryItems)
    .where(
      and(eq(pantryItems.listId, listId), eq(pantryItems.foodId, input.foodId)),
    )
    .limit(1)

  const packageSizeG =
    input.packageSizeG ?? existing?.packageSizeG ?? food.packageSizeG
  if (!packageSizeG) return { ok: false, error: 'package_size_required' }

  if (!existing) {
    await client.insert(pantryItems).values({
      userId,
      familyId,
      foodId: input.foodId,
      sealedPackages: Math.min(MAX_PACKAGES, input.packages),
      remainingG: 0,
      packageSizeG,
    })
    return { ok: true }
  }

  // Restocking resizes the cupboard to the package actually bought, so a jar
  // that came back from the shop smaller is not counted as the old one.
  await writeStock(
    client,
    existing,
    normalise(totalG(existing) + input.packages * packageSizeG, packageSizeG),
  )

  return { ok: true }
}

/** Grams a shopping row stands for, or null when it counts pieces. */
export function groceryRowGrams(item: {
  quantity: number
  unit: 'pz' | 'g' | 'kg' | 'l' | 'ml'
}): number | null {
  switch (item.unit) {
    case 'g':
    case 'ml':
      return item.quantity
    case 'kg':
    case 'l':
      return item.quantity * 1000
    case 'pz':
      return null
  }
}

/**
 * Ticking a product off the shopping list puts it back in the cupboard — but
 * only for products the household already tracks. A negative quantity is the
 * undo, for the row that was ticked by mistake. Buying a tracked jar and
 * having the app still think it is empty is the one failure that would make
 * nobody trust the automatic row again.
 */
export async function restockFromGrocery(
  client: Client,
  userId: string,
  item: {
    foodId: string | null
    quantity: number
    unit: 'pz' | 'g' | 'kg' | 'l' | 'ml'
  },
): Promise<void> {
  if (!item.foodId) return

  const familyIds = await getFamilyIds(userId, client)
  const [existing] = await client
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.foodId, item.foodId),
        pantryVisibility(userId, familyIds),
      ),
    )
    .limit(1)
  if (!existing) return

  const grams = groceryRowGrams(item)
  const added = grams ?? item.quantity * existing.packageSizeG
  await writeStock(
    client,
    existing,
    normalise(totalG(existing) + added, existing.packageSizeG),
  )
}

/** Recomputes a row into a Stock, which is what `writeStock` takes. */
export function stockOf(
  row: Stock,
  patch: Partial<Stock>,
): Stock {
  const packageSizeG = patch.packageSizeG ?? row.packageSizeG
  return normalise(
    (patch.sealedPackages ?? row.sealedPackages) * packageSizeG +
      (patch.remainingG ?? row.remainingG),
    packageSizeG,
  )
}

/** Shapes a row for the wire, with the derived numbers no screen should redo. */
export function toPantryPayload<
  T extends Stock & { lowNotifiedAt: Date | null },
>(row: T) {
  return {
    ...row,
    totalG: totalG(row),
    packagesLeft: packagesLeft(row),
    low: isLow(row),
  }
}
