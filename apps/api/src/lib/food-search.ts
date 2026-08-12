import { and, getTableColumns, sql as raw } from 'drizzle-orm'
import { db } from '../db/index.js'
import { foods, type Food } from '../db/schema.js'
import { foodVisibleTo } from './food-visibility.js'

/** A search hit plus the trigram score that ranked it. */
export type ScoredFood = Food & { score: number }

/**
 * Local catalogue search: exact prefix first, then trigram similarity on
 * "brand + name", with generic (composition-table) foods nudged up — when
 * someone types "pollo" they almost always mean the raw cut, not a ready meal.
 *
 * Lives here rather than in the route because the photo matcher needs the exact
 * same ranking; two copies of this SQL would drift the first time one is tuned.
 */
export async function searchLocalFoods(
  term: string,
  limit: number,
  userId: string,
): Promise<ScoredFood[]> {
  const like = `%${term}%`
  const nameKey = raw`unaccent(lower(${foods.name}))`
  const brandKey = raw`unaccent(lower(coalesce(${foods.brand}, '')))`
  /**
   * Generic foods are named in one number by the catalogue — "Pesche", never
   * "pesca" — and carry the other forms, plus the English name, in `aliases`.
   * Flattening the array to a string is what the `foods_aliases_trgm` index is
   * built on, so both the LIKE and the similarity below stay indexable.
   */
  const aliasHaystack = raw`food_alias_haystack(${foods.aliases})`
  const aliasKey = raw`unaccent(lower(${aliasHaystack}))`

  /**
   * OFF holds the same product under several barcodes, with the brand spelled
   * differently each time ("Ferrero", "Nutella", "FerreroNutella"), so "nutella"
   * alone returns a dozen identical rows. Collapse on name + energy — same name
   * and same kcal is the same food in practice — and keep the most useful copy:
   * branded, with a photo and a serving size, most recently imported.
   */
  const deduped = db
    .selectDistinctOn([nameKey, raw`round(${foods.kcal100})`], {
      ...getTableColumns(foods),
      /**
       * "Is this the same food?", as opposed to the ORDER BY below, which
       * answers "which of these should be shown first". The search route drops
       * this; the photo matcher thresholds on it to decide whether to preselect
       * a catalogue food or fall back to an estimate.
       *
       * `strict_word_similarity` and not `similarity`, because plain similarity
       * divides by the length of the whole name and so punishes a correct match
       * against a long name. Measured against the seeded catalogue:
       *
       *   query -> name                             strict_word   similarity
       *   olio oliva -> Olio extravergine di oliva      0.750        0.333
       *   riso -> Riso bianco cotto                     1.000        0.278
       *   pasta pomodoro -> Pomodori     (wrong)        0.438        0.438
       *
       * With plain similarity the wrong answer outranks the right one, so no
       * threshold could separate them.
       *
       * The explicit alias is required: referencing a raw field of a subquery
       * without one throws at query-build time.
       */
      score: raw<number>`greatest(
        strict_word_similarity(${term}, ${foods.name}),
        strict_word_similarity(${term}, coalesce(${foods.brand}, '')),
        strict_word_similarity(${term}, ${aliasHaystack})
      )`.as('score'),
    })
    .from(foods)
    .where(
      and(
        foodVisibleTo(userId),
        raw`(
        ${nameKey} like unaccent(lower(${like}))
        or ${brandKey} like unaccent(lower(${like}))
        or ${aliasKey} like unaccent(lower(${like}))
        or similarity(${foods.name}, ${term}) > 0.22
      )`,
      ),
    )
    .orderBy(
      raw`${nameKey}, round(${foods.kcal100}),
        (${foods.brand} is null),
        (${foods.imageUrl} is null),
        (${foods.servingSizeG} is null),
        ${foods.updatedAt} desc`,
    )
    .as('deduped')

  return db
    .select()
    .from(deduped)
    .orderBy(
      raw`
        (case
          when unaccent(lower(${deduped.name})) like unaccent(lower(${term + '%'})) then 0
          -- An alias hit dead on is as good as a name: "pesche" is what the
          -- catalogue calls the food curated as "Pesca", and it should not
          -- rank under "Pesche secche" just for being spelled differently.
          when exists (
            select 1 from unnest(coalesce(${deduped.aliases}, '{}')) alias
            where unaccent(lower(alias)) = unaccent(lower(${term}))
          ) then 0
          when exists (
            select 1 from unnest(coalesce(${deduped.aliases}, '{}')) alias
            where unaccent(lower(alias)) like unaccent(lower(${term + '%'}))
          ) then 1
          else 2
        end),
        (case when ${deduped.source} = 'generic' then 0 else 1 end),
        ${deduped.score} desc,
        -- Among equally good matches, the hand-checked row: "pasta" should
        -- open on semola, not on the shortest name in the generated half.
        ${deduped.verified} desc,
        length(${deduped.name}) asc
      `,
    )
    .limit(limit)
}

/** Accent- and case-insensitive, matching what the SQL above compares. */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Whether the local catalogue already answered the question well enough to
 * leave Open Food Facts alone.
 *
 * The search route falls back to the OFF network search whenever the local hit
 * list looks thin, which is right for a branded product nobody has scanned yet
 * and wrong for plain food: OFF is an archive of packaged goods, so "pesca"
 * comes back as iced tea, nectar and jam, and those land above the fruit that
 * was already sitting in the results. A generic food whose name or alias
 * starts with what was typed is as good an answer as that call can produce.
 */
export function hasConfidentGenericMatch(
  results: readonly ScoredFood[],
  term: string,
): boolean {
  const needle = normalise(term)
  if (needle.length < 3) return false

  return results.some(
    (food) =>
      food.source === 'generic' &&
      [food.name, ...(food.aliases ?? [])].some((label) =>
        normalise(label).startsWith(needle),
      ),
  )
}
