import { and, eq, sql as raw } from 'drizzle-orm'
import { db, sql } from '../db/index.js'
import {
  diaryEntries,
  favorites,
  foods,
  profiles,
  users,
  weightLogs,
} from '../db/schema.js'
import { allGenericFoods } from '../data/generic-catalogue.js'
import { hashPassword } from '../lib/password.js'
import { dailyTargets, scaleNutriments } from '../lib/nutrition.js'
import { searchOff } from '../lib/off.js'

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'demo@calorico.app'
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'calorico123'

/** Popular Italian supermarket products, pulled once from OFF so search has content. */
const OFF_SEED_QUERIES = [
  'nutella',
  'barilla pasta',
  'mulino bianco',
  'coop italia',
  'esselunga',
  'conad',
  'granarolo latte',
  'muller yogurt',
  'plasmon',
  'galbani',
  'rio mare tonno',
  'san benedetto',
  'kinder',
  'pavesi',
  'misura',
]

/** Local calendar day, N days ago. toISOString() would shift to UTC and put
 *  "today" on yesterday's row for anyone east of Greenwich. */
function dayOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function seedGenericFoods() {
  // Generic foods have no barcode, so dedupe on the name instead.
  const existing = await db
    .select({ name: foods.name, aliases: foods.aliases })
    .from(foods)
    .where(eq(foods.source, 'generic'))
  const known = new Map(existing.map((r) => [r.name, r]))
  const missing = allGenericFoods.filter((f) => !known.has(f.name))

  // A few thousand rows: one statement per chunk keeps the parameter count
  // inside what the driver will bind.
  for (let i = 0; i < missing.length; i += 500) {
    await db.insert(foods).values(missing.slice(i, i + 500))
  }

  // Rows seeded before the catalogue existed have no search aliases. Backfill
  // rather than reinsert: a diary entry may already point at them. Only rows
  // that were already there — the ones just inserted arrived with aliases, and
  // a missing key must not read as a missing column.
  const stale = allGenericFoods.filter((food) => {
    const existing = known.get(food.name)
    return existing != null && existing.aliases == null && food.aliases?.length
  })
  for (const food of stale) {
    await db
      .update(foods)
      .set({ aliases: food.aliases })
      .where(and(eq(foods.source, 'generic'), eq(foods.name, food.name)))
  }

  console.log(
    `generic foods: ${known.size} existing, ${missing.length} inserted, ${stale.length} given aliases`,
  )
}

async function seedOffProducts() {
  if (process.env.SEED_SKIP_OFF === 'true') {
    console.log('skipping Open Food Facts seed (SEED_SKIP_OFF=true)')
    return
  }
  let inserted = 0
  for (const query of OFF_SEED_QUERIES) {
    try {
      const products = await searchOff(query, 24)
      const withBarcode = products.filter((p) => p.barcode)
      if (withBarcode.length === 0) continue
      // Dedupe inside the batch — one search page can repeat a barcode.
      const unique = [
        ...new Map(withBarcode.map((p) => [p.barcode!, p])).values(),
      ]
      const rows = await db
        .insert(foods)
        .values(unique)
        .onConflictDoNothing({
          target: foods.barcode,
          // The unique index is partial, so ON CONFLICT has to repeat its predicate.
          where: raw`${foods.barcode} is not null`,
        })
        .returning({ id: foods.id })
      inserted += rows.length
      console.log(`  "${query}" -> ${rows.length} new products`)
      // OFF rate-limits the search endpoint to ~10 requests/minute.
      await new Promise((r) => setTimeout(r, 1200))
    } catch (err) {
      console.warn(`  "${query}" failed:`, (err as Error).message)
    }
  }
  console.log(`Open Food Facts: ${inserted} products cached`)
}

async function seedDemoUser() {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(raw`lower(${users.email}) = ${DEMO_EMAIL.toLowerCase()}`)
    .limit(1)

  if (existing) {
    console.log(`demo user already exists (${DEMO_EMAIL})`)
    return existing.id
  }

  const targets = dailyTargets({
    sex: 'male',
    weightKg: 78,
    heightCm: 180,
    age: 29,
    activityLevel: 'moderate',
    goal: 'lose',
  })

  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        name: 'Davide',
        passwordHash: await hashPassword(DEMO_PASSWORD),
      })
      .returning()

    await tx.insert(profiles).values({
      userId: user!.id,
      sex: 'male',
      birthDate: '1996-04-12',
      heightCm: 180,
      startWeightKg: 80.4,
      targetWeightKg: 74,
      activityLevel: 'moderate',
      goal: 'lose',
      targetKcal: targets.targetKcal,
      targetProteinG: targets.targetProteinG,
      targetCarbsG: targets.targetCarbsG,
      targetFatG: targets.targetFatG,
      targetKcalMin: targets.targetKcalMin,
      targetKcalMax: targets.targetKcalMax,
    })

    return user!.id
  })

  console.log(`demo user created: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
  return userId
}

async function seedDiary(userId: string) {
  const [already] = await db
    .select({ id: diaryEntries.id })
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId))
    .limit(1)
  if (already) {
    console.log('diary already has entries, skipping')
    return
  }

  const pick = async (name: string) => {
    const [row] = await db
      .select()
      .from(foods)
      .where(raw`${foods.name} ilike ${'%' + name + '%'}`)
      .orderBy(raw`length(${foods.name}) asc`)
      .limit(1)
    return row
  }

  const template = [
    { name: 'Avena in fiocchi', meal: 'breakfast' as const, grams: 60 },
    { name: 'Latte parzialmente scremato', meal: 'breakfast' as const, grams: 200 },
    { name: 'Banana', meal: 'breakfast' as const, grams: 120 },
    { name: 'Pasta di semola cruda', meal: 'lunch' as const, grams: 90 },
    { name: 'Pomodori', meal: 'lunch' as const, grams: 150 },
    { name: 'Parmigiano Reggiano', meal: 'lunch' as const, grams: 15 },
    { name: 'Yogurt greco 0%', meal: 'snack' as const, grams: 170 },
    { name: 'Mandorle', meal: 'snack' as const, grams: 25 },
    { name: 'Petto di pollo crudo', meal: 'dinner' as const, grams: 180 },
    { name: 'Zucchine', meal: 'dinner' as const, grams: 200 },
    { name: 'Olio extravergine di oliva', meal: 'dinner' as const, grams: 15 },
    { name: 'Pane integrale', meal: 'dinner' as const, grams: 60 },
  ]

  const resolved = (
    await Promise.all(
      template.map(async (t) => ({ ...t, food: await pick(t.name) })),
    )
  ).filter((t) => t.food)

  const rows = []
  // 14 days of history with a little jitter so the charts look real.
  for (let d = 13; d >= 0; d--) {
    const day = dayOffset(d)
    // Skip a couple of days entirely — nobody logs perfectly.
    if (d === 9 || d === 4) continue
    for (const item of resolved) {
      const jitter = 0.82 + ((d * 7 + item.grams) % 13) / 30
      const grams = Math.round(item.grams * (d === 0 ? 1 : jitter))
      const macros = scaleNutriments(item.food!, grams)
      rows.push({
        userId,
        foodId: item.food!.id,
        day,
        meal: item.meal,
        quantityG: grams,
        nameSnapshot: item.food!.name,
        brandSnapshot: item.food!.brand,
        ...macros,
      })
    }
  }

  await db.insert(diaryEntries).values(rows)
  console.log(`diary: ${rows.length} entries over 12 days`)

  const favIds = resolved.slice(0, 5).map((r) => r.food!.id)
  if (favIds.length > 0) {
    await db
      .insert(favorites)
      .values(favIds.map((foodId) => ({ userId, foodId })))
      .onConflictDoNothing()
  }
}

async function seedWeights(userId: string) {
  const [already] = await db
    .select({ id: weightLogs.id })
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .limit(1)
  if (already) return

  const rows = []
  let weight = 80.4
  for (let d = 42; d >= 0; d -= 3) {
    weight -= 0.25 + ((d % 4) * 0.05 - 0.1)
    rows.push({
      userId,
      day: dayOffset(d),
      weightKg: Math.round(weight * 10) / 10,
    })
  }
  await db.insert(weightLogs).values(rows).onConflictDoNothing()
  console.log(`weight: ${rows.length} weigh-ins`)
}

/**
 * The demo account and its fortnight of invented meals are a development
 * convenience, and on a public deployment they are an account with a password
 * printed in the README. `--foods` loads the catalogue and stops there, which
 * is the only part of this script a live database should ever see.
 */
const foodsOnly =
  process.argv.includes('--foods') || process.env.SEED_FOODS_ONLY === 'true'

async function main() {
  console.log(foodsOnly ? 'seeding foods...' : 'seeding...')
  await seedGenericFoods()
  await seedOffProducts()

  if (!foodsOnly) {
    const userId = await seedDemoUser()
    await seedDiary(userId)
    await seedWeights(userId)
  }

  console.log('done')
  await sql.end()
}

main().catch(async (err) => {
  console.error(err)
  await sql.end()
  process.exit(1)
})
