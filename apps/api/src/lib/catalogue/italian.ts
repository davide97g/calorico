/**
 * Italian-side shaping of the generic catalogue: which shelf a food belongs on,
 * and the words someone might actually type to find it.
 *
 * The OFF taxonomy has no `synonyms.it` at all — checked against the live file,
 * the count is zero — so every alias here is produced locally. Aliases feed a
 * trigram match, where a wrong extra form costs a rare bad hit and a missing
 * one costs "pesche" finding nothing.
 */

/**
 * Ancestor tag -> the shelf labels the hand-curated foods in data/generic-foods.ts
 * already use, so the two halves of the catalogue group together. First match in
 * this order wins: the specific shelves are listed before the broad ones they
 * sit under (charcuterie under meats, nuts under plant foods).
 */
const CATEGORY_BY_ANCESTOR: Array<[string, string]> = [
  ['en:charcuterie', 'Salumi'],
  ['en:hams', 'Salumi'],
  ['en:eggs', 'Uova'],
  ['en:cheeses', 'Latticini'],
  ['en:dairies', 'Latticini'],
  ['en:yogurts', 'Latticini'],
  ['en:milks', 'Latticini'],
  ['en:seafood', 'Pesce'],
  ['en:fishes', 'Pesce'],
  ['en:meats', 'Carne'],
  ['en:poultry', 'Carne'],
  ['en:nuts', 'Frutta secca'],
  ['en:legumes', 'Legumi'],
  ['en:pulses', 'Legumi'],
  ['en:breads', 'Pane'],
  ['en:pastas', 'Cereali'],
  ['en:rice', 'Cereali'],
  ['en:breakfast-cereals', 'Cereali'],
  ['en:cereals-and-their-products', 'Cereali'],
  ['en:fruits', 'Frutta'],
  ['en:vegetables', 'Verdura'],
  ['en:potatoes', 'Verdura'],
  ['en:fats', 'Grassi'],
  ['en:vegetable-oils', 'Grassi'],
  ['en:sweet-snacks', 'Dolci'],
  ['en:desserts', 'Dolci'],
  ['en:confectioneries', 'Dolci'],
  ['en:salty-snacks', 'Snack salati'],
  ['en:sauces', 'Salse e condimenti'],
  ['en:condiments', 'Salse e condimenti'],
  ['en:meals', 'Piatti pronti'],
  ['en:beverages', 'Bevande'],
]

/** Drunk, not eaten — decides whether the diary offers ml or g. */
const LIQUID_ANCESTORS = new Set([
  'en:beverages',
  'en:waters',
  'en:juices',
  'en:fruit-juices',
  'en:milks',
  'en:plant-based-beverages',
  'en:alcoholic-beverages',
  'en:hot-beverages',
  'en:teas',
  'en:coffees',
])

/**
 * Everything under `en:plant-based-foods-and-beverages` would otherwise read as
 * a drink — the tag covers bread. Same trap off.ts documents for products.
 */
const LIQUID_FALSE_FRIENDS = new Set([
  'en:plant-based-foods-and-beverages',
  'en:beverages-and-beverages-preparations',
])

/**
 * A plausible default portion per shelf, in grams or ml. CIQUAL has no serving
 * sizes — it is a composition table — and a diary that always opens at 100 g
 * makes the user do arithmetic for every apple. These are round numbers chosen
 * to be edited, not measurements; the hand-curated foods carry real ones.
 */
const SERVING_BY_CATEGORY: Record<string, number> = {
  Frutta: 150,
  Verdura: 200,
  Carne: 150,
  Pesce: 150,
  Salumi: 50,
  Uova: 55,
  Latticini: 125,
  Cereali: 80,
  Pane: 50,
  Legumi: 150,
  'Frutta secca': 30,
  Grassi: 10,
  Dolci: 30,
  'Snack salati': 30,
  'Salse e condimenti': 20,
  'Piatti pronti': 300,
  Bevande: 200,
}

export interface Shelf {
  category: string | null
  isLiquid: boolean
  servingSizeG: number | null
}

export function shelfFor(ancestors: readonly string[]): Shelf {
  const tags = new Set(ancestors)
  const category =
    CATEGORY_BY_ANCESTOR.find(([tag]) => tags.has(tag))?.[1] ?? null

  const isLiquid = [...tags].some(
    (t) => LIQUID_ANCESTORS.has(t) && !LIQUID_FALSE_FRIENDS.has(t),
  )

  return {
    category,
    isLiquid,
    servingSizeG: category ? (SERVING_BY_CATEGORY[category] ?? null) : null,
  }
}

/** "Pesche (fresche, crude)" -> "pesche". */
function bare(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[,;].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The other number of the head noun, which in an Italian food name is nearly
 * always the first word ("purè di patate", "petto di pollo"). Catalogue names
 * arrive in whichever number the taxonomy used — "Fragole" but "Aceto
 * balsamico" — so both directions are covered by one table.
 *
 * One form per ending, the common one: "fragole" -> "fragola" is worth having,
 * "fragoli" is not a word and only widens the trigram net for nothing. The
 * agreement of any trailing adjective is left wrong on purpose ("aceti
 * balsamico") — aliases are matched, never shown.
 */
const PLURAL_TO_SINGULAR: Record<string, string> = {
  a: 'e', // pesca -> pesche
  e: 'a', // fragole -> fragola
  o: 'i', // pomodoro -> pomodori
  i: 'o', // fagioli -> fagiolo
}

function inflect(phrase: string): string[] {
  const [head, ...rest] = phrase.split(' ')
  if (!head || head.length < 4) return []

  const vowel = PLURAL_TO_SINGULAR[head.at(-1)!]
  if (!vowel) return []

  let stem = head.slice(0, -1)
  // Italian writes an h to keep c and g hard in front of e and i, and drops it
  // in front of a and o: acciuga/acciughe, crusca/crusche. Without this the
  // forms come out as "acciugha" and "crusce".
  if ((vowel === 'a' || vowel === 'o') && /(ch|gh)$/.test(stem)) {
    stem = stem.slice(0, -1)
  } else if ((vowel === 'e' || vowel === 'i') && /[cg]$/.test(stem)) {
    stem += 'h'
  }

  return [[stem + vowel, ...rest].join(' ')]
}

/**
 * The singular of an English plural, or null if it already looks singular.
 *
 * The taxonomy names its categories in the plural — "peaches", "strawberries" —
 * and someone typing an English word types one peach. Without this, "peach"
 * still matches "peaches" as a substring but scores below "peach nectars",
 * which contains the whole word, and the fruit ranks under the drink.
 */
function englishSingular(phrase: string): string | null {
  const words = phrase.split(' ')
  const last = words.at(-1)
  if (!last || last.length < 4) return null

  const singular = /ies$/.test(last)
    ? `${last.slice(0, -3)}y` // strawberries -> strawberry
    : /(ch|sh|s|x|z)es$/.test(last)
      ? last.slice(0, -2) // peaches -> peach
      : /[^s]s$/.test(last)
        ? last.slice(0, -1) // apples -> apple
        : null

  return singular ? [...words.slice(0, -1), singular].join(' ') : null
}

/**
 * Search terms for one food: the name as written, without its qualifiers, in
 * the other number, plus whatever the caller already knows — model-written
 * synonyms, and the English name in both numbers.
 *
 * Italian inflection is applied only to the Italian name. Italian plural rules
 * on an English word produce "appla crumbles"; English rules on an Italian one
 * are no better.
 */
export function searchAliases(
  name: string,
  extra: readonly string[] = [],
  english: readonly string[] = [],
): string[] {
  const canonical = bare(name)
  const candidates = [
    canonical,
    ...inflect(canonical),
    ...extra.map(bare),
    ...english.flatMap((e) => {
      const cleaned = bare(e)
      if (!cleaned) return []
      const singular = englishSingular(cleaned)
      return singular ? [cleaned, singular] : [cleaned]
    }),
  ]

  const out: string[] = []
  for (const candidate of candidates) {
    if (candidate.length < 3 || candidate === name.toLowerCase()) continue
    if (out.includes(candidate)) continue
    out.push(candidate)
    if (out.length === 8) break
  }
  return out
}
