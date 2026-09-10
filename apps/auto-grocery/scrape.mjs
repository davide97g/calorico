#!/usr/bin/env node
// Reads the Tosano catalogue through the same JSON API the website's own
// frontend calls (`/ebsn/api/...`, an eBSN platform). No browser needed: one
// session cookie is enough, and prices only come back when it is present —
// anonymously every `price` is null.
//
//   node scrape.mjs categories
//   node scrape.mjs products <categoryId> [maxPages]   # NDJSON on stdout
//   node scrape.mjs product <slug>                     # detail + nutrition
//   node scrape.mjs search <text> [maxPages]
//
// The cookie comes from the logged-in browser session left behind by login.sh,
// or from LATUASPESA_COOKIE if you would rather pass it yourself.

import { execFileSync } from 'node:child_process'

const BASE = process.env.LATUASPESA_BASE_URL ?? 'https://www.latuaspesa.com'
const API = `${BASE}/ebsn/api`
// The catalogue is priced per warehouse and per delivery slot, and the frontend
// carries that choice in a `hash` parameter: w<warehouseId>d<YYYY-MM-DD>t<slot>.
// Without it the API still answers, with the account's current selection.
const HASH = process.env.LATUASPESA_HASH ?? ''
const PAGE_SIZE = 200
// Be a recognisable guest: same courtesy the project already extends to Open
// Food Facts.
const USER_AGENT = process.env.LATUASPESA_USER_AGENT ?? 'Calorico auto-grocery (personal use)'
const DELAY_MS = Number(process.env.LATUASPESA_DELAY_MS ?? 400)

function sessionCookie() {
  if (process.env.LATUASPESA_COOKIE) return process.env.LATUASPESA_COOKIE
  try {
    const out = execFileSync(
      'agent-browser',
      ['--session', 'autogrocery', '--restore', 'eval', "document.cookie.match(/X-Ebsn-Account=[^;]+/)?.[0] ?? ''"],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const cookie = out.trim().split('\n').pop().replace(/^"|"$/g, '')
    if (cookie.startsWith('X-Ebsn-Account=')) return cookie
  } catch {
    // agent-browser missing or no session: fall through to the warning below.
  }
  console.error('! no session cookie: prices will come back null.')
  console.error('  run ./login.sh first, or set LATUASPESA_COOKIE.')
  return ''
}

const cookie = sessionCookie()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, params = {}) {
  const url = new URL(`${API}/${path}`)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  if (HASH) url.searchParams.set('hash', HASH)
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url.pathname}${url.search}`)
  const body = await res.json()
  // The platform wraps everything in {response, data} and reports trouble in
  // response.errors while still answering 200.
  const errors = body.response?.errorsMessage ?? []
  if (errors.length) throw new Error(`api: ${errors.join('; ')}`)
  return body.data
}

// --- nutrition ------------------------------------------------------------
// `metaData.product_description.nutritional_values` is an HTML table typed by
// hand, per product, in Italian. Only the "per 100 g" column is trustworthy:
// the portion column is optional and its size is a footnote.
const NUTRIENT_KEYS = [
  [/^energia/i, 'kcal'],
  [/acidi grassi saturi/i, 'saturatedFatG'],
  [/^grassi/i, 'fatG'],
  [/di cui zuccheri/i, 'sugarsG'],
  [/^carboidrati/i, 'carbsG'],
  [/^proteine/i, 'proteinG'],
  [/^fibre/i, 'fiberG'],
  [/^sale/i, 'saltG'],
]

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;?/g, ' ').replace(/\s+/g, ' ').trim()
const toNumber = (text) => {
  const m = text.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Energy is written with both units and no fixed separator: "261kJ/62kcal",
// "141 kJ - 33 kcal". Take the number that is actually labelled kcal, and only
// convert from kJ when the label is missing altogether.
function energyKcal(text) {
  const kcal = text.match(/(-?\d+(?:[.,]\d+)?)\s*kcal/i)
  if (kcal) return toNumber(kcal[1])
  const kj = text.match(/(-?\d+(?:[.,]\d+)?)\s*kj/i)
  return kj ? Math.round(toNumber(kj[1]) / 4.184) : null
}

function parseNutrition(html) {
  if (!html) return null
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
    [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => stripTags(cell)),
  )
  const out = {}
  for (const cells of rows) {
    const [label, per100] = cells
    if (!label || !per100) continue
    const key = NUTRIENT_KEYS.find(([re]) => re.test(label))?.[1]
    if (!key || out[key] != null) continue
    out[key] = key === 'kcal' ? energyKcal(per100) : toNumber(per100)
  }
  return Object.keys(out).length ? out : null
}

// --- shapes ---------------------------------------------------------------
const asListing = (p) => ({
  id: p.productId,
  code: p.code,
  barcode: p.barcode || null,
  name: p.name,
  description: p.description || null,
  brand: p.vendor?.name ?? null,
  price: p.price ?? null,
  priceUnit: p.priceUnitDisplay ?? null,
  pricePerUm: p.priceUmDisplay ?? null,
  umBase: p.unitMeasureBaseSelling?.um ?? null,
  weightSellingG: p.productInfos?.WEIGHT_SELLING ? Number(p.productInfos.WEIGHT_SELLING) : null,
  weightUnitSelling: p.productInfos?.WEIGHT_UNIT_SELLING ?? null,
  slug: p.slug,
  categoryId: p.categoryId,
  category: (p.breadCrumbs ?? []).map((b) => b.name).join(' / ') || null,
  promo: p.warehousePromo?.promoType ?? null,
  imageUrl: p.mediaURLMedium ?? p.mediaURL ?? null,
})

const asDetail = (p) => {
  const descr = p.metaData?.product_description ?? {}
  return {
    ...asListing(p),
    ingredients: descr.ingredients ? stripTags(descr.ingredients) : null,
    allergens: descr.allergens ? stripTags(descr.allergens) : null,
    storage: descr.storage ? stripTags(descr.storage) : null,
    nutritionPer100g: parseNutrition(descr.nutritional_values),
  }
}

// --- commands -------------------------------------------------------------
async function categories() {
  const data = await api('category', { filtered: true })
  const list = Array.isArray(data) ? data : (data.categories ?? [])
  for (const c of list) console.log(`${c.categoryId}\t${c.name}\t${c.slug ?? ''}`)
}

async function* pages(params, maxPages) {
  for (let page = 1; ; page += 1) {
    const data = await api('products', { ...params, page, page_size: PAGE_SIZE })
    const found = data.products ?? []
    yield* found
    const total = data.page?.totPages ?? 1
    if (page >= total || (maxPages && page >= maxPages) || found.length === 0) return
    await sleep(DELAY_MS)
  }
}

async function products(params, maxPages) {
  let n = 0
  for await (const p of pages(params, maxPages)) {
    console.log(JSON.stringify(asListing(p)))
    n += 1
  }
  console.error(`${n} products`)
}

async function product(slug) {
  const data = await api('products', { slug })
  const p = data.products?.[0] ?? data
  if (!p?.productId) throw new Error(`no product for slug ${slug}`)
  console.log(JSON.stringify(asDetail(p), null, 2))
}

const [command, ...rest] = process.argv.slice(2)
const commands = {
  categories: () => categories(),
  products: () => products({ parent_category_id: rest[0] }, Number(rest[1]) || 0),
  search: () => products({ q: rest[0] }, Number(rest[1]) || 0),
  product: () => product(rest[0]),
}

if (!commands[command]) {
  console.error('usage: scrape.mjs categories | products <categoryId> [maxPages] | search <text> [maxPages] | product <slug>')
  process.exit(2)
}

try {
  await commands[command]()
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
