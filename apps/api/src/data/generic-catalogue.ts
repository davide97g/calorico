import type { CatalogueFood } from '../lib/catalogue/build.js'
import { searchAliases } from '../lib/catalogue/italian.js'
import type { NewFood } from '../db/schema.js'
import { genericFoods } from './generic-foods.js'
import catalogue from './generic-catalogue.json' with { type: 'json' }

/**
 * The generated half of the unpackaged catalogue: Open Food Facts category
 * names joined to ANSES-CIQUAL composition, built by
 * scripts/build-generic-catalogue.ts and committed as JSON.
 *
 * Sources and licences, both of which the About screen credits:
 *   Open Food Facts categories taxonomy — ODbL
 *   ANSES-CIQUAL 2020 composition table — attribution required
 */
const generated = catalogue as CatalogueFood[]

function toFood(food: CatalogueFood): NewFood {
  return {
    source: 'generic' as const,
    barcode: null,
    name: food.name,
    aliases: food.aliases,
    brand: null,
    category: food.category,
    kcal100: food.kcal100,
    protein100: food.protein100,
    carbs100: food.carbs100,
    sugars100: food.sugars100,
    fat100: food.fat100,
    satFat100: food.satFat100,
    fiber100: food.fiber100,
    salt100: food.salt100,
    servingSizeG: food.servingSizeG,
    unit: food.isLiquid ? 'ml' : 'g',
    isLiquid: food.isLiquid,
    countries: ['en:italy'],
    /**
     * A proxy row is a near-enough composition, and a translated name has not
     * been read by anyone. Neither is wrong enough to withhold, but neither
     * earns the badge the hand-checked foods carry.
     */
    verified: !food.proxy && !food.translated,
  }
}

/**
 * Everything unpackaged, hand-curated foods first.
 *
 * The two halves overlap — both know what a strawberry is — and the curated
 * entry wins every collision: its numbers come from the Italian tables
 * (CREA/BDA-IEO) rather than the French one, and it carries a real serving size
 * instead of the per-shelf guess the generated rows fall back on.
 *
 * Its search terms do not win, though: they are inherited from the generated
 * row it displaced. The curated list is Italian-only, so dropping that row
 * whole took "strawberries" and "strawberry" with it and left the fruit
 * unfindable in English — the one thing the generated half was better at.
 */
export const allGenericFoods: NewFood[] = (() => {
  const curated = genericFoods.map((food) => ({
    ...food,
    aliases: searchAliases(food.name),
  }))

  /**
   * A generated row is the same food when its name is any form of a curated
   * one — "Pesche" against curated "Pesca", not only against another "Pesche".
   * The two tables disagree by a few kcal on the same fruit, and two rows a
   * plural apart is the kind of search result that makes someone stop trusting
   * the list.
   */
  const byLabel = new Map<string, (typeof curated)[number]>()
  for (const food of curated) {
    byLabel.set(food.name.toLowerCase(), food)
    for (const alias of food.aliases) byLabel.set(alias, food)
  }

  const kept: NewFood[] = []
  for (const food of generated) {
    const curatedOwner = byLabel.get(food.name.toLowerCase())
    if (!curatedOwner) {
      kept.push(toFood(food))
      continue
    }
    // Absorbed, not dropped: its name and search terms are the English and
    // plural forms the Italian-only curated list never had.
    curatedOwner.aliases = [
      ...new Set([
        ...curatedOwner.aliases,
        food.name.toLowerCase(),
        ...food.aliases,
      ]),
    ]
  }

  return [...curated, ...kept]
})()
