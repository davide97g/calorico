import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import {
  CIQUAL_ALIM_FILE,
  CIQUAL_COMPO_FILE,
  CIQUAL_ENCODING,
  parseCiqualAlim,
  parseCiqualCompo,
} from '../lib/catalogue/ciqual.js'
import {
  buildFood,
  isLoggable,
  pruneCollidingAliases,
  type CatalogueFood,
} from '../lib/catalogue/build.js'
import { collectCandidates, type Taxonomy } from '../lib/catalogue/taxonomy.js'
import {
  createTranslator,
  translatorFromEnv,
  type Translation,
  type TranslationRequest,
} from '../lib/catalogue/translate.js'
import { readZipEntries } from '../lib/catalogue/zip.js'

/**
 * Rebuilds data/generic-catalogue.json — the unpackaged half of the food
 * catalogue, the part a barcode can never reach.
 *
 * Two sources, joined on the CIQUAL food code:
 *   Open Food Facts categories taxonomy (ODbL) -> what the food is called
 *   ANSES-CIQUAL 2020 composition table        -> what is in it
 *
 * A category with no Italian name in the taxonomy gets one from an LLM, once,
 * here — the API never translates anything at request time. The result is
 * committed, so this script is only run when a source is refreshed, and its
 * diff is the review.
 *
 * Usage:
 *   npm run build:catalogue            # full run, translations included
 *   npm run build:catalogue -- --no-llm    # taxonomy names only (~700 foods)
 *   npm run build:catalogue -- --limit 50  # smoke test
 *
 * Downloads land in .cache/catalogue and are reused; delete it to refresh.
 */

const TAXONOMY_URL =
  'https://static.openfoodfacts.org/data/taxonomies/categories.json'
const CIQUAL_URL =
  'https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = resolve(here, '../data/generic-catalogue.json')
const DEFAULT_CACHE = resolve(here, '../../.cache/catalogue')

const args = process.argv.slice(2)
const getArg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const outPath = getArg('out') ?? DEFAULT_OUT
const cacheDir = getArg('cache') ?? DEFAULT_CACHE
const useLlm = !args.includes('--no-llm')
const limit = Number(getArg('limit') ?? Infinity)
/**
 * Names per request. Sized against the clock rather than the token cost: a
 * batch of 40 spends long enough generating that it runs past the client
 * timeout, and a timed-out batch costs everything it had already produced.
 */
const batchSize = Number(getArg('batch') ?? 20)

async function download(url: string, filename: string): Promise<Buffer> {
  await mkdir(cacheDir, { recursive: true })
  const path = join(cacheDir, filename)
  if (existsSync(path)) {
    console.log(`cached ${filename}`)
    return readFile(path)
  }
  console.log(`downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path, buf)
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB -> ${path}`)
  return buf
}

/** Runs the batches a few at a time: the provider rate-limits, and this is not
 *  a job anyone waits on interactively. */
async function translateAll(
  requests: TranslationRequest[],
  translate: (batch: TranslationRequest[]) => Promise<Map<string, Translation>>,
): Promise<Map<string, Translation>> {
  const batches: TranslationRequest[][] = []
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize))
  }

  const out = new Map<string, Translation>()
  let done = 0
  const concurrency = 4
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const batch = batches.shift()
      if (!batch) return
      try {
        for (const [code, translation] of await translate(batch)) {
          out.set(code, translation)
        }
      } catch (err) {
        // A lost batch costs a few foods, not the run: the codes it covered
        // simply stay unnamed and are dropped downstream.
        console.warn(`  batch failed: ${(err as Error).message}`)
      }
      done += batch.length
      console.log(`  translated ${out.size}/${done} of ${requests.length}`)
    }
  })
  await Promise.all(workers)
  return out
}

async function main() {
  const [taxonomyRaw, ciqualZip] = await Promise.all([
    download(TAXONOMY_URL, 'categories.json'),
    download(CIQUAL_URL, 'ciqual-xml.zip'),
  ])

  const taxonomy = JSON.parse(taxonomyRaw.toString('utf8')) as Taxonomy
  const candidates = collectCandidates(taxonomy).slice(0, limit)
  console.log(
    `taxonomy: ${Object.keys(taxonomy).length} categories, ${candidates.length} with a CIQUAL code`,
  )

  const entries = readZipEntries(ciqualZip, [CIQUAL_COMPO_FILE, CIQUAL_ALIM_FILE])
  const wanted = new Set(candidates.map((c) => c.ciqualCode))
  const nutrients = parseCiqualCompo(
    entries.get(CIQUAL_COMPO_FILE)!.toString(CIQUAL_ENCODING),
    wanted,
  )
  const foods = parseCiqualAlim(
    entries.get(CIQUAL_ALIM_FILE)!.toString(CIQUAL_ENCODING),
  )
  console.log(`ciqual: composition for ${nutrients.size} of ${wanted.size} codes`)

  const untranslated = candidates.filter(
    (c) => !c.nameIt && isLoggable(nutrients.get(c.ciqualCode)),
  )
  console.log(
    `italian names: ${candidates.length - untranslated.length} from the taxonomy, ${untranslated.length} to translate`,
  )

  let translations = new Map<string, Translation>()
  if (useLlm && untranslated.length > 0) {
    const options = translatorFromEnv()
    if (!options) {
      console.warn(
        'no CATALOGUE_LLM_* or VISION_* credentials — run with --no-llm to accept a taxonomy-only catalogue',
      )
      process.exit(1)
    }
    console.log(`translating with ${options.model}`)
    translations = await translateAll(
      untranslated.map((c) => {
        const ciqual = foods.get(c.ciqualCode)
        return {
          code: c.ciqualCode,
          nameEn: c.nameEn ?? ciqual?.nameEn ?? c.tag.replace(/^\w+:/, ''),
          nameFr: ciqual?.nameFr,
        }
      }),
      createTranslator(options),
    )
  }

  const catalogue: CatalogueFood[] = []
  for (const candidate of candidates) {
    const food = buildFood({
      candidate,
      nutrients: nutrients.get(candidate.ciqualCode),
      translation: translations.get(candidate.ciqualCode),
    })
    if (food) catalogue.push(food)
  }
  pruneCollidingAliases(catalogue)
  catalogue.sort((a, b) => a.name.localeCompare(b.name, 'it'))

  await writeFile(outPath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8')

  const translated = catalogue.filter((f) => f.translated).length
  const shelved = catalogue.filter((f) => f.category).length
  console.log(
    `wrote ${catalogue.length} foods to ${outPath}\n` +
      `  ${catalogue.length - translated} named by the taxonomy, ${translated} translated\n` +
      `  ${shelved} on a known shelf, ${catalogue.filter((f) => f.proxy).length} on a proxy composition row`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
