import { env } from '../env.js'
import { deriveKcal } from './nutrition.js'
import type { NewFood } from '../db/schema.js'

/**
 * Minimal Open Food Facts client.
 *
 * OFF data is crowdsourced and uneven: missing nutriments, kJ-only records,
 * serving sizes written as free text ("1 bicchiere (200 ml)"), duplicate
 * barcodes. Everything that leaves this module has already been normalised to
 * per-100 g values, or is dropped.
 *
 * Licence: ODbL. Attribution is required — see the About screen in the web app.
 */

/** Canonical OFF category tags that mean "this is a drink". */
const LIQUID_TAGS = new Set([
  'en:beverages',
  'en:non-alcoholic-beverages',
  'en:alcoholic-beverages',
  'en:waters',
  'en:mineral-waters',
  'en:spring-waters',
  'en:juices',
  'en:fruit-juices',
  'en:fruit-nectars',
  'en:sodas',
  'en:carbonated-drinks',
  'en:colas',
  'en:energy-drinks',
  'en:sports-drinks',
  'en:iced-teas',
  'en:milks',
  'en:dairy-drinks',
  'en:plant-based-milk-alternatives',
  'en:beers',
  'en:wines',
  'en:coffee-drinks',
  'en:syrups',
])

/**
 * OFF puts nearly every food under `en:plant-based-foods-and-beverages`, so a
 * naive "does any tag contain beverages" check marks sliced bread as a drink.
 */
const LIQUID_TAG_FALSE_FRIENDS = new Set([
  'en:plant-based-foods-and-beverages',
  'en:beverages-and-beverages-preparations',
])

/** Categories that settle the question: these are eaten, never drunk. */
const SOLID_TAGS = new Set([
  'en:cheeses',
  'en:fresh-cheeses',
  'en:mozzarella',
  'en:yogurts',
  'en:butters',
  'en:creams',
  'en:ice-creams-and-sorbets',
  'en:breads',
  'en:biscuits-and-cakes',
  'en:breakfast-cereals',
  'en:spreads',
  'en:cheese-spreads',
])

export interface OffProduct {
  code?: string
  product_name?: string
  product_name_it?: string
  generic_name_it?: string
  /** String in the v2 product API, array in the search service. */
  brands?: string | string[]
  categories?: string
  categories_tags?: string[]
  quantity?: string
  serving_size?: string
  serving_quantity?: number | string
  image_front_small_url?: string
  image_small_url?: string
  image_url?: string
  countries_tags?: string[]
  nutriments?: Record<string, number | string | undefined>
}

function firstBrand(brands: OffProduct['brands']): string | null {
  if (!brands) return null
  const raw = Array.isArray(brands) ? brands[0] : brands.split(',')[0]
  return raw?.trim() || null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "30 g", "1 biscotto (12,5 g)", "200ml" -> grams. */
export function parseServingGrams(
  serving?: string,
  servingQuantity?: number | string,
): number | null {
  const direct = num(servingQuantity)
  if (direct != null && direct > 0 && direct < 2000) return direct
  if (!serving) return null
  const match = serving.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(g|ml|gr)/i)
  if (!match?.[1]) return null
  const grams = Number(match[1])
  return grams > 0 && grams < 2000 ? grams : null
}

export function isLiquidProduct(p: OffProduct): boolean {
  const tags = (p.categories_tags ?? []).map((t) => t.toLowerCase())
  if (tags.some((t) => SOLID_TAGS.has(t))) return false

  const candidates = tags.filter((t) => !LIQUID_TAG_FALSE_FRIENDS.has(t))

  if (candidates.some((t) => LIQUID_TAGS.has(t))) return true
  if (
    candidates.some((t) =>
      /(^|:|-)(beverages|drinks|waters|juices|sodas|beers|wines|smoothies)$/.test(
        t,
      ),
    )
  ) {
    return true
  }
  // Last resort: the net quantity is expressed in a volume unit.
  return /(?:^|\s)\d+(?:[.,]\d+)?\s*(ml|cl|dl|l)\b/i.test(p.quantity ?? '')
}

/**
 * Maps an OFF product to our foods row. Returns null when the record is not
 * loggable (no name, or no usable energy value).
 */
export function mapOffProduct(p: OffProduct): NewFood | null {
  const name = (p.product_name_it || p.product_name || p.generic_name_it || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (name.length < 2) return null

  const n = p.nutriments ?? {}
  const protein = num(n['proteins_100g'])
  const carbs = num(n['carbohydrates_100g'])
  const fat = num(n['fat_100g'])
  const kcal = deriveKcal({
    kcal: num(n['energy-kcal_100g']),
    kj: num(n['energy-kj_100g']) ?? num(n['energy_100g']),
    protein,
    carbs,
    fat,
  })
  // Reject records we cannot log honestly, and obvious unit mistakes.
  if (kcal == null || kcal <= 0 || kcal > 950) return null

  const liquid = isLiquidProduct(p)
  const serving = parseServingGrams(p.serving_size, p.serving_quantity)

  return {
    source: 'off',
    barcode: p.code?.trim() || null,
    name,
    brand: firstBrand(p.brands),
    category: p.categories?.split(',')[0]?.trim() || null,
    imageUrl:
      p.image_front_small_url || p.image_small_url || p.image_url || null,
    kcal100: Math.round(kcal * 10) / 10,
    protein100: protein ?? 0,
    carbs100: carbs ?? 0,
    sugars100: num(n['sugars_100g']),
    fat100: fat ?? 0,
    satFat100: num(n['saturated-fat_100g']),
    fiber100: num(n['fiber_100g']),
    salt100: num(n['salt_100g']),
    servingSizeG: serving,
    servingLabel: p.serving_size?.trim() || null,
    unit: liquid ? 'ml' : 'g',
    isLiquid: liquid,
    countries: p.countries_tags ?? null,
    raw: null,
  }
}

const FIELDS = [
  'code',
  'product_name',
  'product_name_it',
  'generic_name_it',
  'brands',
  'categories',
  'categories_tags',
  'quantity',
  'serving_size',
  'serving_quantity',
  'image_front_small_url',
  'image_small_url',
  'countries_tags',
  'nutriments',
].join(',')

async function offFetch(
  base: string,
  path: string,
  params: Record<string, string>,
) {
  const url = new URL(path, base)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  // OFF returns 503 under load; one short retry turns most of those into hits.
  let lastError: Error | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': env.OFF_USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      if (res.ok) return (await res.json()) as unknown
      lastError = new Error(`OFF ${res.status} for ${url.pathname}`)
      if (res.status < 500 && res.status !== 429) break
    } catch (err) {
      lastError = err as Error
    } finally {
      clearTimeout(timeout)
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
  }
  throw lastError ?? new Error('OFF request failed')
}

export async function fetchByBarcode(
  barcode: string,
): Promise<NewFood | null> {
  if (!env.OFF_ENABLED) return null
  const data = (await offFetch(
    env.OFF_BASE_URL,
    `/api/v2/product/${barcode}.json`,
    { fields: FIELDS },
  )) as { status?: number; product?: OffProduct }
  if (!data?.product) return null
  return mapOffProduct(data.product)
}

/**
 * Full-text search restricted to products sold in Italy, via the
 * search-a-licious service. Results are cached into `foods` by the caller.
 *
 * Note the Lucene-style query: the `countries_tags` request parameter is
 * ignored by that service, the filter has to be part of `q`.
 */
export async function searchOff(query: string, limit = 20): Promise<NewFood[]> {
  if (!env.OFF_ENABLED) return []
  // The query parser only ANDs a filter onto free text when every term is
  // spelled out: `mulino bianco AND countries_tags:"..."` returns nothing,
  // `mulino AND bianco AND countries_tags:"..."` returns the expected products.
  const terms = query
    .replace(/[+\-!(){}[\]^"~*?:\\/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 6)
  if (terms.length === 0) return []

  const data = (await offFetch(env.OFF_SEARCH_URL, '/search', {
    q: [...terms, 'countries_tags:"en:italy"'].join(' AND '),
    fields: FIELDS,
    page_size: String(Math.min(limit, 50)),
    sort_by: '-popularity_key',
  })) as { hits?: OffProduct[] }

  const out: NewFood[] = []
  const seen = new Set<string>()
  for (const p of data.hits ?? []) {
    const mapped = mapOffProduct(p)
    if (!mapped) continue
    const key = mapped.barcode ?? `${mapped.name}|${mapped.brand}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(mapped)
  }
  return out
}
