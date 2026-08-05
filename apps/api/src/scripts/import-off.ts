import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { sql as raw } from 'drizzle-orm'
import { db, sql } from '../db/index.js'
import { foods, type NewFood } from '../db/schema.js'
import { mapOffProduct, type OffProduct } from '../lib/off.js'

/**
 * Bulk import of the Open Food Facts JSONL dump, restricted to products sold in
 * Italy. Data is ODbL — attribution required, share-alike on republished
 * derivatives.
 *
 * Usage:
 *   # download once (~10 GB gzipped, ~4M products)
 *   curl -O https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
 *   npm run import:off -- --file ./openfoodfacts-products.jsonl.gz
 *
 *   # or stream it straight from the CDN without keeping the file
 *   npm run import:off -- --url
 *
 * For repeated experiments prefer the Parquet dump + DuckDB to pre-filter Italy,
 * then point --file at the JSONL you export. This script exists so a fresh VPS
 * can populate itself with one command.
 */

const DUMP_URL =
  'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz'

const args = process.argv.slice(2)
const getArg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const filePath = getArg('file')
const useUrl = args.includes('--url')
const limit = Number(getArg('limit') ?? Infinity)
const batchSize = Number(getArg('batch') ?? 1000)

if (!filePath && !useUrl) {
  console.error(
    'Provide --file <path-to-openfoodfacts-products.jsonl.gz> or --url to stream from the CDN.',
  )
  process.exit(1)
}

function isItalian(p: OffProduct): boolean {
  return (p.countries_tags ?? []).includes('en:italy')
}

async function flush(batch: NewFood[]) {
  if (batch.length === 0) return 0
  // Dedupe within the batch: the dump can contain the same barcode twice.
  const byBarcode = new Map<string, NewFood>()
  for (const row of batch) {
    if (row.barcode) byBarcode.set(row.barcode, row)
  }
  const rows = [...byBarcode.values()]
  if (rows.length === 0) return 0

  await db
    .insert(foods)
    .values(rows)
    .onConflictDoUpdate({
      target: foods.barcode,
      targetWhere: raw`${foods.barcode} is not null`,
      set: {
        name: raw`excluded.name`,
        brand: raw`excluded.brand`,
        category: raw`excluded.category`,
        imageUrl: raw`excluded.image_url`,
        kcal100: raw`excluded.kcal_100`,
        protein100: raw`excluded.protein_100`,
        carbs100: raw`excluded.carbs_100`,
        fat100: raw`excluded.fat_100`,
        sugars100: raw`excluded.sugars_100`,
        satFat100: raw`excluded.sat_fat_100`,
        fiber100: raw`excluded.fiber_100`,
        salt100: raw`excluded.salt_100`,
        servingSizeG: raw`excluded.serving_size_g`,
        servingLabel: raw`excluded.serving_label`,
        updatedAt: new Date(),
      },
    })
  return rows.length
}

async function main() {
  const gunzip = createGunzip()

  if (filePath) {
    void pipeline(createReadStream(filePath), gunzip).catch((err) => {
      console.error('read failed', err)
      process.exit(1)
    })
  } else {
    console.log(`streaming ${DUMP_URL}`)
    const res = await fetch(DUMP_URL)
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
    void pipeline(Readable.fromWeb(res.body as never), gunzip).catch((err) => {
      console.error('download failed', err)
      process.exit(1)
    })
  }

  const lines = createInterface({ input: gunzip, crlfDelay: Infinity })

  let seen = 0
  let italian = 0
  let imported = 0
  let batch: NewFood[] = []
  const started = Date.now()

  for await (const line of lines) {
    if (!line) continue
    seen++

    let product: OffProduct
    try {
      product = JSON.parse(line) as OffProduct
    } catch {
      continue // truncated line in the dump — skip it
    }

    if (!isItalian(product)) continue
    italian++

    const mapped = mapOffProduct(product)
    if (!mapped?.barcode) continue
    batch.push(mapped)

    if (batch.length >= batchSize) {
      imported += await flush(batch)
      batch = []
      const rate = Math.round(seen / ((Date.now() - started) / 1000))
      console.log(
        `scanned ${seen.toLocaleString()} | italian ${italian.toLocaleString()} | imported ${imported.toLocaleString()} | ${rate}/s`,
      )
    }

    if (imported >= limit) break
  }

  imported += await flush(batch)
  console.log(
    `done: scanned ${seen.toLocaleString()}, italian ${italian.toLocaleString()}, imported ${imported.toLocaleString()}`,
  )
  await sql.end()
}

main().catch(async (err) => {
  console.error(err)
  await sql.end()
  process.exit(1)
})
