import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { diaryEntries, scanEvents, type DiaryEntry } from '../db/schema.js'
import { groceryVisibility } from './family.js'

/**
 * "What did we buy last time?" ranking, shared by the scan history screen and
 * by the suggestions the grocery input shows while you type.
 *
 * Plain "most recent first" is wrong for both: a week of shopping buries the
 * milk you buy every Tuesday under one-off scans, and a list ordered by raw
 * count never forgets the brand you stopped buying in March. So every add or
 * scan is one sample, weighted by how long ago it happened, and an item's score
 * is the sum of its samples:
 *
 *     score = Σ 0.5 ^ (age_in_days / HALF_LIFE_DAYS)
 *
 * That is an exponentially weighted moving average of how often the item comes
 * up — frequency and recency in one number, with no cron job to maintain: a
 * sample counts 1 the day it happens, 0.5 a month later, 0.25 two months later.
 * Something bought weekly sits far above something bought five times last
 * spring, and drops on its own once you stop buying it.
 *
 * Half-life of a month because a household's staples turn over on that scale:
 * short enough that last week outranks last season, long enough that skipping
 * one shop does not evict an item from the top of the list.
 */
const HALF_LIFE_DAYS = 30

const decayed = (at: SQL, halfLifeDays = HALF_LIFE_DAYS) =>
  sql`power(
    0.5,
    extract(epoch from (now() - ${at})) / ${halfLifeDays * 86400}
  )`

/** `%` and `_` are ordinary characters in a shopping list, not wildcards. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&')

/** Accent- and case-insensitive substring match, as everywhere else in search. */
const matches = (column: SQL, term: string) =>
  sql`unaccent(lower(${column})) like unaccent(lower(${`%${escapeLike(term)}%`}))`

/** Scan rows the user may see: their families' scans, plus their own private ones. */
function scanVisibility(userId: string, familyIds: string[]): SQL {
  const own = and(isNull(scanEvents.familyId), eq(scanEvents.userId, userId))!
  if (familyIds.length === 0) return own
  return or(inArray(scanEvents.familyId, familyIds), own)!
}

/**
 * The key two scans of the same thing share. A product is the food row it
 * resolved to; a barcode that never resolved is still the same product each
 * time; a photo scan only ever has its summary line.
 *
 * Deliberately the same shape as `grocery_items.dedupe_key`, so a scanned
 * product and the list row it created collapse into one suggestion below.
 */
const scanKey = sql`coalesce(
  'food:' || ${scanEvents.foodId}::text,
  'code:' || ${scanEvents.barcode},
  'text:' || lower(${scanEvents.nameSnapshot})
)`

export interface RankedScan {
  key: string
  kind: 'barcode' | 'photo'
  foodId: string | null
  barcode: string | null
  nameSnapshot: string
  brandSnapshot: string | null
  items: { label: string; quantityG: number }[] | null
  /** How many times this item was scanned, ever. */
  times: number
  lastAt: Date
  score: number
  scannedBy: { id: string; name: string; avatarUrl: string | null }
}

/**
 * Scan history, one row per distinct item, best-remembered first. The snapshots
 * and the author come from that item's most recent scan — the name a product
 * carried last time is the one worth showing.
 */
export async function rankedScans(
  userId: string,
  familyIds: string[],
  { limit, offset, term }: { limit: number; offset: number; term?: string },
): Promise<RankedScan[]> {
  const visible = scanVisibility(userId, familyIds)
  const filter = term
    ? and(visible, matches(sql`${scanEvents.nameSnapshot}`, term))!
    : visible

  const rows = await db.execute(sql`
    with events as (
      select
        ${scanKey} as key,
        ${scanEvents.id} as id,
        ${scanEvents.createdAt} as at,
        ${decayed(sql`${scanEvents.createdAt}`)} as weight
      from ${scanEvents}
      where ${filter}
    ),
    ranked as (
      select
        key,
        count(*)::int as times,
        max(at) as last_at,
        sum(weight)::float8 as score,
        (array_agg(id order by at desc))[1] as last_id
      from events
      group by key
      order by score desc, last_at desc
      limit ${limit}
      offset ${offset}
    )
    select
      ranked.key,
      ranked.times,
      ranked.last_at,
      ranked.score,
      scan_events.kind,
      scan_events.food_id,
      scan_events.barcode,
      scan_events.name_snapshot,
      scan_events.brand_snapshot,
      scan_events.items,
      users.id as scanned_by_id,
      users.name as scanned_by_name,
      users.avatar_url as scanned_by_avatar_url
    from ranked
    join scan_events on scan_events.id = ranked.last_id
    join users on users.id = scan_events.user_id
    order by ranked.score desc, ranked.last_at desc
  `)

  // Raw SQL, so the driver hands back snake_case columns untyped.
  interface Row {
    key: string
    times: number
    last_at: Date
    score: number
    kind: 'barcode' | 'photo'
    food_id: string | null
    barcode: string | null
    name_snapshot: string
    brand_snapshot: string | null
    items: RankedScan['items']
    scanned_by_id: string
    scanned_by_name: string
    scanned_by_avatar_url: string | null
  }

  return (rows as unknown as Row[]).map((row) => ({
    key: row.key,
    kind: row.kind,
    foodId: row.food_id,
    barcode: row.barcode,
    nameSnapshot: row.name_snapshot,
    brandSnapshot: row.brand_snapshot,
    items: row.items,
    times: Number(row.times),
    lastAt: row.last_at,
    score: Number(row.score),
    scannedBy: {
      id: row.scanned_by_id,
      name: row.scanned_by_name,
      avatarUrl: row.scanned_by_avatar_url,
    },
  }))
}

/**
 * The same ranking, pointed at the diary: which foods to offer someone who is
 * about to log what they always log.
 *
 * Half-life of a fortnight rather than a month. A shopping list turns over on
 * the scale of a household's staples; what somebody eats turns over faster, and
 * the food they had yesterday is a better bet than the one they had five times
 * last month.
 */
const DIARY_HALF_LIFE_DAYS = 14

/**
 * What an entry logged at a different meal counts towards this meal's ranking.
 *
 * A hard filter on the meal would hand a first breakfast an empty list and
 * would hide the leftovers people genuinely eat at any hour. Discounting
 * instead puts porridge at the top of a breakfast list without pretending last
 * night's lasagne was never eaten.
 */
const OTHER_MEAL_WEIGHT = 0.35

/** How many remembered portions a food carries. Three chips fit one row. */
const TOP_QUANTITIES = 3

/**
 * What meeting a food counts for next to eating it — a barcode scanned, a search
 * hit opened, a food created by hand. See `food_touches`.
 *
 * Well under one whole entry, on purpose: a food scanned this morning should be
 * easy to find again, and should still sit below the yogurt eaten every day. At
 * 0.3 an encounter today ranks just under a single entry from a week ago, and a
 * habit — many entries, summed — stays out of reach.
 */
const TOUCH_WEIGHT = 0.3

export interface RankedDiaryFood {
  foodId: string
  /**
   * The portion this food was logged with the last time it was logged, or null
   * when it has only ever been met and never eaten.
   */
  lastQuantityG: number | null
  /** Its best-remembered portions, in the same order as the ranking. Empty when never logged. */
  topQuantities: number[]
  /** How many times it has been logged, ever. Zero for a food only ever met. */
  times: number
  lastAt: Date
  score: number
}

/**
 * Foods this user logs, best-remembered first, each with the portions they use.
 *
 * The portion is the point: the daily job is not "find yogurt", it is "the
 * usual 180 g of yogurt". Both the strip on the dashboard and the quick-log
 * sheet read this, so a tap can write a complete entry.
 *
 * `include: 'all'` folds in the foods this user has merely met — see
 * `food_touches` — which is what the Recenti list on the search screen wants: a
 * product scanned and then abandoned used to vanish, and the next attempt to
 * find it started from the barcode again. The strip and the quick-log sheet ask
 * for the default, `'logged'`: both promise a portion with one tap, and a food
 * never eaten has no portion to promise.
 */
export async function rankedDiaryFoods(
  userId: string,
  {
    limit,
    meal,
    include = 'logged',
  }: {
    limit: number
    meal?: DiaryEntry['meal']
    include?: 'logged' | 'all'
  },
): Promise<RankedDiaryFood[]> {
  // Both branches spelled as float8. Postgres types a bare parameter from the
  // other branch of the case, so `then 1 else $n` made the discount an integer
  // and the whole query failed with "invalid input syntax for type integer:
  // 0.35" — every meal-weighted request, which is every request the dashboard
  // strip and the quick-log sheet make.
  const mealWeight = meal
    ? sql`(case when ${diaryEntries.meal}::text = ${meal} then 1::float8 else ${OTHER_MEAL_WEIGHT}::float8 end)`
    : sql`1::float8`

  // One encounter is one sample, weighted once however many times it happened:
  // reopening a food screen is not a habit, and should not be able to climb the
  // list by repetition the way eating something does.
  const touched =
    include === 'all'
      ? sql`
          select
            food_id,
            times,
            last_at,
            (${TOUCH_WEIGHT}::float8 * ${decayed(sql`food_touches.last_at`, DIARY_HALF_LIFE_DAYS)})::float8 as score
          from food_touches
          where user_id = ${userId}
        `
      : // Same columns, no rows: the join below stays one query either way.
        sql`
          select food_id, times, last_at, 0::float8 as score
          from food_touches
          where false
        `

  const rows = await db.execute(sql`
    with events as (
      select
        ${diaryEntries.foodId} as food_id,
        ${diaryEntries.quantityG} as quantity_g,
        ${diaryEntries.createdAt} as at,
        ${decayed(sql`${diaryEntries.createdAt}`, DIARY_HALF_LIFE_DAYS)}
          * ${mealWeight} as weight
      from ${diaryEntries}
      where ${diaryEntries.userId} = ${userId}
        and ${diaryEntries.foodId} is not null
    ),
    -- One sample per portion, so a food's own history can be ranked the same
    -- way the foods themselves are: 180 g eaten weekly beats the 300 g once.
    per_quantity as (
      select
        food_id,
        quantity_g,
        count(*)::int as times,
        sum(weight)::float8 as weight,
        max(at) as last_at
      from events
      group by food_id, quantity_g
    ),
    logged as (
      select
        food_id,
        sum(times)::int as times,
        sum(weight)::float8 as score,
        max(last_at) as last_at,
        (array_agg(quantity_g order by weight desc, last_at desc))[1:${sql.raw(String(TOP_QUANTITIES))}] as top_quantities,
        (array_agg(quantity_g order by last_at desc))[1] as last_quantity_g
      from per_quantity
      group by food_id
    ),
    touched as (${touched})
    select
      coalesce(logged.food_id, touched.food_id) as food_id,
      coalesce(logged.times, 0)::int as times,
      (coalesce(logged.score, 0) + coalesce(touched.score, 0))::float8 as score,
      -- greatest() skips nulls in Postgres, so a food on one side only keeps its
      -- own date.
      greatest(logged.last_at, touched.last_at) as last_at,
      logged.top_quantities as top_quantities,
      logged.last_quantity_g as last_quantity_g
    from logged
    full outer join touched on touched.food_id = logged.food_id
    order by score desc, last_at desc
    limit ${limit}
  `)

  interface Row {
    food_id: string
    times: number
    score: number
    last_at: Date
    top_quantities: number[] | null
    last_quantity_g: number | null
  }

  return (rows as unknown as Row[]).map((row) => ({
    foodId: row.food_id,
    lastQuantityG:
      row.last_quantity_g == null ? null : Number(row.last_quantity_g),
    topQuantities: (row.top_quantities ?? []).map(Number),
    times: Number(row.times),
    lastAt: row.last_at,
    score: Number(row.score),
  }))
}

export interface FoodPortions {
  /** null when this user has never logged this food. */
  lastQuantityG: number | null
  topQuantities: number[]
  times: number
}

/**
 * One food's portion history: what this user weighed out last, and what they
 * weigh out most. The portion field on the food screen opens on the first and
 * offers the rest as chips, so the usual amount never has to be retyped.
 *
 * No meal weighting here, unlike the ranking above: 180 g of yogurt is 180 g of
 * yogurt whether it was breakfast or supper.
 */
export async function foodPortions(
  userId: string,
  foodId: string,
): Promise<FoodPortions> {
  const rows = await db.execute(sql`
    with per_quantity as (
      select
        ${diaryEntries.quantityG} as quantity_g,
        count(*)::int as times,
        sum(${decayed(sql`${diaryEntries.createdAt}`, DIARY_HALF_LIFE_DAYS)})
          as weight,
        max(${diaryEntries.createdAt}) as last_at
      from ${diaryEntries}
      where ${diaryEntries.userId} = ${userId}
        and ${diaryEntries.foodId} = ${foodId}
      group by ${diaryEntries.quantityG}
    )
    select
      coalesce(sum(times), 0)::int as times,
      (array_agg(quantity_g order by weight desc, last_at desc))[1:${sql.raw(String(TOP_QUANTITIES))}] as top_quantities,
      (array_agg(quantity_g order by last_at desc))[1] as last_quantity_g
    from per_quantity
  `)

  interface Row {
    times: number
    top_quantities: number[] | null
    last_quantity_g: number | null
  }

  const row = (rows as unknown as Row[])[0]
  return {
    lastQuantityG:
      row?.last_quantity_g == null ? null : Number(row.last_quantity_g),
    topQuantities: (row?.top_quantities ?? []).map(Number),
    times: Number(row?.times ?? 0),
  }
}

export interface GrocerySuggestion {
  /** The `dedupe_key` an add would use, so the caller can dedupe against search hits. */
  key: string
  name: string
  brand: string | null
  foodId: string | null
  times: number
  lastAt: Date
  score: number
}

/**
 * What to offer while someone types into the grocery input: everything this
 * list has held before, plus everything scanned into it, ranked as above.
 *
 * Rows already waiting on the list are left out — they are visible right below
 * the input, and suggesting them would only ever bump a quantity. Photo scans
 * are left out too: their snapshot is a summary of a meal ("pasta, pollo,
 * insalata"), which is not a line anybody wants on a shopping list.
 */
export async function grocerySuggestions(
  userId: string,
  familyIds: string[],
  { limit, term }: { limit: number; term: string },
): Promise<GrocerySuggestion[]> {
  const groceryVisible = groceryVisibility(userId, familyIds)
  const scanVisible = and(
    scanVisibility(userId, familyIds),
    eq(scanEvents.kind, 'barcode'),
  )!

  const rows = await db.execute(sql`
    with events as (
      select
        grocery_items.dedupe_key as key,
        grocery_items.name_snapshot as name,
        grocery_items.brand_snapshot as brand,
        grocery_items.food_id as food_id,
        grocery_items.created_at as at,
        ${decayed(sql`grocery_items.created_at`)} as weight
      from grocery_items
      where ${groceryVisible}
        and ${matches(sql`grocery_items.name_snapshot`, term)}

      union all

      select
        ${scanKey},
        ${scanEvents.nameSnapshot},
        ${scanEvents.brandSnapshot},
        ${scanEvents.foodId},
        ${scanEvents.createdAt},
        ${decayed(sql`${scanEvents.createdAt}`)}
      from ${scanEvents}
      where ${scanVisible}
        and ${matches(sql`${scanEvents.nameSnapshot}`, term)}
    ),
    grouped as (
      select
        key,
        (array_agg(name order by at desc))[1] as name,
        (array_agg(brand order by at desc))[1] as brand,
        (array_agg(food_id order by at desc))[1] as food_id,
        count(*)::int as times,
        max(at) as last_at,
        sum(weight)::float8 as score
      from events
      where key not in (
        select dedupe_key from grocery_items
        where ${groceryVisible} and grocery_items.completed = false
      )
      group by key
    )
    select * from grouped
    order by
      -- A name that starts with what was typed first, then the ranking: typing
      -- "lat" should open on "Latte", not on the "Insalata" bought more often.
      (case
        when unaccent(lower(name)) like unaccent(lower(${`${escapeLike(term)}%`})) then 0
        else 1
      end),
      score desc,
      last_at desc
    limit ${limit}
  `)

  interface Row {
    key: string
    name: string
    brand: string | null
    food_id: string | null
    times: number
    last_at: Date
    score: number
  }

  return (rows as unknown as Row[]).map((row) => ({
    key: row.key,
    name: row.name,
    brand: row.brand,
    foodId: row.food_id,
    times: Number(row.times),
    lastAt: row.last_at,
    score: Number(row.score),
  }))
}
