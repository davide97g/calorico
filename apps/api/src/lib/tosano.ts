import { env } from '../env.js'
import { deriveKcal } from './nutrition.js'
import { fetchByBarcode as fetchOffByBarcode } from './off.js'
import type { NewFood } from '../db/schema.js'

/**
 * Tosano (latuaspesa.com) as a second opinion when Open Food Facts comes back
 * empty — a barcode nobody has photographed yet, a regional product, a search
 * the OFF index answers with 503.
 *
 * The site's own frontend talks to an eBSN JSON API, and so do we: no token,
 * no session. A cookie only unlocks prices, which a food diary has no use for.
 *
 * Two things shape everything below:
 *
 * - **The listing carries no nutrition.** `?q=` returns names, barcodes and
 *   brands; the per-100 g table lives behind a second call on the product's
 *   slug, and only about a quarter of products have one at all.
 * - **A barcode is the join key.** Every product carries one, so a Tosano hit
 *   with no nutrition table of its own is still worth an OFF lookup by that
 *   barcode. Tosano then acted as the search index and OFF as the source, and
 *   the row says `off`, because that is where the numbers came from.
 */

interface TosanoUnitMeasure {
  /** `KG` for anything weighed, `L` for anything poured. */
  um?: string
}

export interface TosanoProduct {
  productId?: number
  name?: string
  /** The brand, shouted: "NUTELLA", "BARILLA". */
  shortDescr?: string
  /** The pack size, always "<unit>. <number>": "GR. 304", "ML. 330 X 6 PZ.". */
  description?: string
  slug?: string
  barcode?: string
  vendor?: { name?: string }
  mediaURL?: string
  mediaURLMedium?: string
  breadCrumbs?: { name?: string }[]
  unitMeasureBaseSelling?: TosanoUnitMeasure
  metaData?: {
    product_description?: {
      /** A hand-typed Italian HTML table, per product. */
      nutritional_values?: string
    }
  }
}

/** Per 100 g/ml, as the label prints it. */
export interface TosanoNutrition {
  kcal: number | null
  protein: number | null
  carbs: number | null
  sugars: number | null
  fat: number | null
  satFat: number | null
  fiber: number | null
  salt: number | null
}

/**
 * Row labels in the order they have to be tested: "di cui acidi grassi saturi"
 * contains "grassi", and "di cui zuccheri" is a child row of the carbohydrates.
 */
const NUTRIENT_ROWS: [RegExp, keyof TosanoNutrition][] = [
  [/^energia/i, 'kcal'],
  [/acidi grassi saturi/i, 'satFat'],
  [/^grassi/i, 'fat'],
  [/di cui zuccheri/i, 'sugars'],
  [/^carboidrati/i, 'carbs'],
  [/^prote/i, 'protein'],
  [/^fibre/i, 'fiber'],
  [/^sale/i, 'salt'],
]

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()

function num(text: string): number | null {
  const match = text.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

/**
 * Energy is written with both units and no fixed separator: "261kJ/62kcal",
 * "141 kJ - 33 kcal", "2158 kJ / 515 kcal". Take the number that is actually
 * labelled kcal, and only convert from kJ when there is no kcal at all.
 */
function energyKcal(text: string): number | null {
  const kcal = text.match(/(-?\d+(?:[.,]\d+)?)\s*kcal/i)
  if (kcal?.[1]) return num(kcal[1])
  const kj = text.match(/(-?\d+(?:[.,]\d+)?)\s*kj/i)
  const value = kj?.[1] ? num(kj[1]) : null
  return value == null ? null : value / 4.184
}

/** Cells of one `<tr>`, tags stripped, `<th>` and `<td>` alike. */
function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
    [...(row ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      ([, cell]) => stripTags(cell ?? ''),
    ),
  )
}

/**
 * Reads the per-100 column out of the label table. The portion column next to
 * it is skipped on purpose: its size is a footnote ("Per porzione***"), so the
 * numbers cannot be scaled to anything.
 */
export function parseNutritionTable(html?: string): TosanoNutrition | null {
  if (!html) return null
  const rows = tableRows(html)

  // Most tables are label / per 100 g / per portion / %RI, but not all of them
  // put the per-100 column first, so the header decides when it says so.
  let column = 1
  for (const cells of rows) {
    const found = cells.findIndex((c) => /100\s*(g|ml|gr)/i.test(c))
    if (found > 0) {
      column = found
      break
    }
  }

  const out: TosanoNutrition = {
    kcal: null,
    protein: null,
    carbs: null,
    sugars: null,
    fat: null,
    satFat: null,
    fiber: null,
    salt: null,
  }
  let filled = 0
  for (const cells of rows) {
    const label = cells[0]
    const value = cells[column]
    if (!label || !value) continue
    const key = NUTRIENT_ROWS.find(([re]) => re.test(label))?.[1]
    // First row wins: a table that repeats a nutrient repeats it for the
    // portion, further down.
    if (!key || out[key] != null) continue
    out[key] = key === 'kcal' ? energyKcal(value) : num(value)
    if (out[key] != null) filled += 1
  }
  return filled > 0 ? out : null
}

const PACK_UNITS: Record<string, { multiplier: number; liquid: boolean }> = {
  gr: { multiplier: 1, liquid: false },
  g: { multiplier: 1, liquid: false },
  kg: { multiplier: 1000, liquid: false },
  ml: { multiplier: 1, liquid: true },
  cl: { multiplier: 10, liquid: true },
  lt: { multiplier: 1000, liquid: true },
  l: { multiplier: 1000, liquid: true },
}

/**
 * "GR. 304", "LT. 1,5 X 2 PZ." — the unit comes first, which is why `off.ts`'s
 * parser cannot read these.
 *
 * A multipack gives back the size of one piece, not of the shrink wrap: 330 ml
 * is what someone drinks and what the label's per-100 values describe.
 */
export function parsePackSize(
  description?: string,
): { sizeG: number; liquid: boolean } | null {
  if (!description) return null
  const match = description
    .replace(',', '.')
    .match(/^\s*(gr|kg|ml|cl|lt|l|g)\.?\s*(\d+(?:\.\d+)?)/i)
  if (!match?.[1] || !match[2]) return null
  const unit = PACK_UNITS[match[1].toLowerCase()]
  if (!unit) return null
  const sizeG = Number(match[2]) * unit.multiplier
  if (!(sizeG > 0) || sizeG >= 20_000) return null
  return { sizeG, liquid: unit.liquid }
}

/**
 * Retail rows are shouted — "COCA COLA ZERO ZUCCHERI", "BARILLA". The diary is
 * not, so a name with no lower case in it gets title case. Anything already
 * mixed case is left exactly as it was typed.
 */
export function titleCase(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ')
  if (!clean || /\p{Ll}/u.test(clean)) return clean
  return clean
    .toLowerCase()
    .replace(/(^|[\s'"“(\-/.])(\p{Ll})/gu, (_, before: string, ch: string) =>
      before + ch.toUpperCase(),
    )
}

/**
 * Maps a product detail to our foods row, or null when it is not loggable —
 * no name, or no nutrition table, which is the common case.
 */
export function mapTosanoProduct(p: TosanoProduct): NewFood | null {
  const name = titleCase(p.name ?? '')
  if (name.length < 2) return null

  const values = parseNutritionTable(
    p.metaData?.product_description?.nutritional_values,
  )
  if (!values) return null

  const kcal = deriveKcal({
    kcal: values.kcal,
    protein: values.protein,
    carbs: values.carbs,
    fat: values.fat,
  })
  // Same honesty bar as OFF: a row nobody can log, or a decimal point in the
  // wrong place, is worse than no row.
  if (kcal == null || kcal <= 0 || kcal > 950) return null

  const pack = parsePackSize(p.description)
  // The pack size is the unit printed on the label, so it decides; the base
  // selling unit only covers the products whose size is unparseable, and it is
  // occasionally mistyped (a litre of milk filed under KG).
  const liquid =
    pack?.liquid ?? p.unitMeasureBaseSelling?.um?.toUpperCase() === 'L'
  const brand = titleCase(p.vendor?.name ?? p.shortDescr ?? '')
  const crumbs = (p.breadCrumbs ?? []).map((c) => c.name).filter(Boolean)

  return {
    source: 'tosano',
    barcode: p.barcode?.trim() || null,
    name,
    brand: brand || null,
    // The deepest breadcrumb is the useful one: "Biscotti frollini", not
    // "Colazione e merenda".
    category: crumbs.length ? titleCase(crumbs[crumbs.length - 1] as string) : null,
    imageUrl: p.mediaURLMedium || p.mediaURL || null,
    kcal100: Math.round(kcal * 10) / 10,
    protein100: values.protein ?? 0,
    carbs100: values.carbs ?? 0,
    sugars100: values.sugars,
    fat100: values.fat ?? 0,
    satFat100: values.satFat,
    fiber100: values.fiber,
    salt100: values.salt,
    // The label's portion column has no size, so there is no serving to store.
    servingSizeG: null,
    servingLabel: null,
    packageSizeG: pack?.sizeG ?? null,
    packageSizeLabel: p.description?.trim() || null,
    unit: liquid ? 'ml' : 'g',
    isLiquid: liquid,
    countries: ['en:italy'],
    raw: null,
  }
}

/** `{ response: { errorsMessage }, data }` — the platform reports trouble in a 200. */
interface TosanoEnvelope {
  response?: { errorsMessage?: string[] }
  data?: unknown
}

async function tosanoFetch(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`/ebsn/api/${path}`, env.TOSANO_BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': env.TOSANO_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Tosano ${res.status} for ${url.pathname}`)
    const body = (await res.json()) as TosanoEnvelope
    const errors = body.response?.errorsMessage ?? []
    if (errors.length > 0) throw new Error(`Tosano: ${errors.join('; ')}`)
    return body.data
  } finally {
    clearTimeout(timeout)
  }
}

async function searchProducts(
  query: string,
  pageSize: number,
): Promise<TosanoProduct[]> {
  const data = (await tosanoFetch('products', {
    q: query,
    page_size: String(pageSize),
  })) as { products?: TosanoProduct[] } | undefined
  return data?.products ?? []
}

/** The detail call answers with a bare product, not with a one-item page. */
async function fetchProduct(slug: string): Promise<TosanoProduct | null> {
  const data = (await tosanoFetch('products', { slug })) as
    | ({ products?: TosanoProduct[] } & TosanoProduct)
    | undefined
  const product = data?.products?.[0] ?? data
  return product?.productId ? product : null
}

/**
 * A barcode, straight to a loggable row. Two calls: the search finds the slug,
 * the slug carries the nutrition table.
 */
export async function fetchTosanoByBarcode(
  barcode: string,
): Promise<NewFood | null> {
  if (!env.TOSANO_ENABLED) return null
  const [hit] = await searchProducts(barcode, 1)
  // Full-text search on a number can match a product that merely mentions it,
  // so the code has to come back identical or this is somebody else's food.
  if (!hit?.slug || hit.barcode?.trim() !== barcode) return null
  const detail = await fetchProduct(hit.slug)
  return detail ? mapTosanoProduct(detail) : null
}

/** Resolves `jobs` at most `width` at a time, keeping their order. */
async function pooled<T>(
  jobs: (() => Promise<T>)[],
  width: number,
): Promise<T[]> {
  const out = new Array<T>(jobs.length)
  let next = 0
  const workers = Array.from({ length: Math.min(width, jobs.length) }, () =>
    (async () => {
      for (let i = next++; i < jobs.length; i = next++) {
        out[i] = await (jobs[i] as () => Promise<T>)()
      }
    })(),
  )
  await Promise.all(workers)
  return out
}

/**
 * Full-text search, one call plus a detail call for the first few hits.
 *
 * A hit whose own label table is missing falls back to Open Food Facts on its
 * barcode — the whole point of reaching for a supermarket is that it knows
 * which products exist, and OFF is still the better nutrition source when it
 * has heard of one. Rows built that way are marked `off`, not `tosano`.
 */
export async function searchTosano(
  query: string,
  limit = 20,
): Promise<NewFood[]> {
  if (!env.TOSANO_ENABLED) return []
  const term = query.trim()
  if (term.length < 2) return []

  const hits = await searchProducts(term, Math.min(Math.max(limit, 8), 50))
  const candidates: TosanoProduct[] = []
  const seenBarcodes = new Set<string>()
  for (const hit of hits) {
    const barcode = hit.barcode?.trim()
    if (!hit.slug || !barcode || seenBarcodes.has(barcode)) continue
    seenBarcodes.add(barcode)
    candidates.push(hit)
    if (candidates.length >= env.TOSANO_SEARCH_DETAILS) break
  }

  const resolved = await pooled(
    candidates.map((hit) => async () => {
      try {
        const detail = await fetchProduct(hit.slug as string)
        const mapped = detail ? mapTosanoProduct(detail) : null
        if (mapped) return mapped
        return await fetchOffByBarcode(hit.barcode as string)
      } catch {
        // One product failing is not the search failing.
        return null
      }
    }),
    3,
  )

  return resolved.filter((food): food is NewFood => food != null)
}
