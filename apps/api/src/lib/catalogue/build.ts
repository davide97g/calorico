import { KCAL_PER_G } from '../nutrition.js'
import type { CiqualNutrients } from './ciqual.js'
import { searchAliases, shelfFor } from './italian.js'
import type { CategoryCandidate } from './taxonomy.js'

/**
 * Joins an Open Food Facts category to its CIQUAL composition row and shapes
 * the result into one catalogue entry — the barcode-less "generic food" a
 * search for "pesca" is supposed to land on.
 *
 * Pure on purpose: the build script owns downloading, caching and the
 * translation pass; everything decided here is decided the same way every run.
 */

/** One row of data/generic-catalogue.json. */
export interface CatalogueFood {
  /** ANSES-CIQUAL food code — the identity of the row across rebuilds. */
  ciqual: string
  /** OFF category tag the name came from. */
  tag: string
  name: string
  aliases: string[]
  category: string | null
  kcal100: number
  protein100: number
  carbs100: number
  sugars100: number | null
  fat100: number
  satFat100: number | null
  fiber100: number | null
  salt100: number | null
  servingSizeG: number | null
  isLiquid: boolean
  /** The CIQUAL row describes a near-enough food rather than this exact one. */
  proxy: boolean
  /** Italian name came from the translation pass, not from the taxonomy. */
  translated: boolean
}

/** Alcohol is not a macro but it is 7 kcal/g, and this catalogue has wine in it. */
const KCAL_PER_G_ALCOHOL = 7

/** Above this, a per-100 g figure is a unit mistake — off.ts uses the same bar. */
const MAX_KCAL_100 = 950

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Roughly a quarter of CIQUAL rows leave energy blank (871 of 3 169 at the time
 * of writing — a raw peach is one of them) while still carrying the macros, so
 * the Atwater sum stands in. Fibre is left out of it: CIQUAL's own convention
 * counts fibre at 2 kcal/g, but the rest of this app derives energy from the
 * three macros alone and a diary that disagrees with itself between two foods
 * is worse than one that is uniformly a few kcal light on lentils.
 */
function energy(n: CiqualNutrients): number | null {
  if (n.kcal != null && n.kcal > 0) return n.kcal
  if (n.kj != null && n.kj > 0) return n.kj / 4.184
  if (n.protein == null && n.carbs == null && n.fat == null) return null

  const computed =
    (n.protein ?? 0) * KCAL_PER_G.protein +
    (n.carbs ?? 0) * KCAL_PER_G.carbs +
    (n.fat ?? 0) * KCAL_PER_G.fat +
    (n.alcohol ?? 0) * KCAL_PER_G_ALCOHOL
  return computed > 0 ? computed : null
}

/**
 * Drops any alias that is another food's actual name.
 *
 * The inflection rules are blind to meaning and the two sources disagree on
 * number, so "Mele" can hand out "mela" while a separate row is named exactly
 * that. An alias competing with a real name is the one case where the wrong
 * food can outrank the one the user typed; everything else the ranking in
 * food-search.ts already settles.
 */
export function pruneCollidingAliases(foods: CatalogueFood[]): CatalogueFood[] {
  const names = new Map(foods.map((f) => [f.name.toLowerCase(), f.ciqual]))
  for (const food of foods) {
    food.aliases = food.aliases.filter((alias) => {
      const owner = names.get(alias)
      return owner == null || owner === food.ciqual
    })
  }
  return foods
}

/**
 * Whether the composition row carries enough to log the food at all. The build
 * script asks before the translation pass: paying an LLM call to name a row
 * that will be dropped for missing energy is the one avoidable cost here.
 */
export function isLoggable(nutrients: CiqualNutrients | undefined): boolean {
  if (!nutrients) return false
  const kcal = energy(nutrients)
  return kcal != null && kcal > 0 && kcal <= MAX_KCAL_100
}

/** "melone di cantalupo" -> "Melone di cantalupo". Taxonomy casing is uneven. */
export function tidyName(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export interface BuildInput {
  candidate: CategoryCandidate
  nutrients: CiqualNutrients | undefined
  /** Italian name from the translation pass, when the taxonomy had none. */
  translation?: { name: string; aliases: string[] } | undefined
}

/**
 * Null when the row cannot be logged honestly: no Italian name to search for,
 * or no energy value to count.
 */
export function buildFood({
  candidate,
  nutrients,
  translation,
}: BuildInput): CatalogueFood | null {
  const italian = candidate.nameIt ?? translation?.name ?? null
  if (!italian || italian.trim().length < 2) return null
  if (!nutrients) return null

  const kcal = energy(nutrients)
  if (kcal == null || kcal <= 0 || kcal > MAX_KCAL_100) return null

  const name = tidyName(italian)
  const shelf = shelfFor(candidate.ancestors)

  return {
    ciqual: candidate.ciqualCode,
    tag: candidate.tag,
    name,
    aliases: searchAliases(
      name,
      [...(translation?.aliases ?? []), ...candidate.synonymsIt],
      candidate.nameEn ? [candidate.nameEn] : [],
    ),
    category: shelf.category,
    kcal100: round(kcal),
    protein100: round(nutrients.protein ?? 0, 2),
    carbs100: round(nutrients.carbs ?? 0, 2),
    sugars100: nutrients.sugars != null ? round(nutrients.sugars, 2) : null,
    fat100: round(nutrients.fat ?? 0, 2),
    satFat100: nutrients.satFat != null ? round(nutrients.satFat, 2) : null,
    fiber100: nutrients.fiber != null ? round(nutrients.fiber, 2) : null,
    salt100: nutrients.salt != null ? round(nutrients.salt, 3) : null,
    servingSizeG: shelf.servingSizeG,
    isLiquid: shelf.isLiquid,
    proxy: candidate.proxy,
    translated: candidate.nameIt == null,
  }
}
