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
  dedupeByName,
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

const translationCache = () => join(cacheDir, 'translations.json')

/**
 * Names already paid for, keyed by CIQUAL code.
 *
 * Kept next to the downloads because a run costs real money and real minutes:
 * the first attempt at this lost 1 500 names to client timeouts and had
 * nothing to resume from. Delete the file to re-translate from scratch.
 */
async function loadTranslations(): Promise<Map<string, Translation>> {
  try {
    const raw = await readFile(translationCache(), 'utf8')
    return new Map(Object.entries(JSON.parse(raw) as Record<string, Translation>))
  } catch {
    return new Map()
  }
}

async function saveTranslations(translations: Map<string, Translation>) {
  await writeFile(
    translationCache(),
    `${JSON.stringify(Object.fromEntries(translations), null, 2)}\n`,
    'utf8',
  )
}

/** Runs the batches a few at a time: the provider rate-limits, and this is not
 *  a job anyone waits on interactively. */
async function translateAll(
  requests: TranslationRequest[],
  translate: (batch: TranslationRequest[]) => Promise<Map<string, Translation>>,
  known: Map<string, Translation>,
): Promise<Map<string, Translation>> {
  const missing = requests.filter((r) => !known.has(r.code))
  if (missing.length < requests.length) {
    console.log(`  ${requests.length - missing.length} already cached`)
  }

  const batches: TranslationRequest[][] = []
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize))
  }

  let done = 0
  let failed = 0
  const concurrency = 4
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const batch = batches.shift()
      if (!batch) return
      try {
        for (const [code, translation] of await translate(batch)) {
          known.set(code, translation)
        }
        // Written every batch, not at the end: an interrupted run keeps
        // everything it has already paid for.
        await saveTranslations(known)
      } catch (err) {
        // A lost batch costs a few foods, not the run: the codes it covered
        // stay unnamed and are dropped downstream, and a rerun retries them.
        failed += batch.length
        console.warn(`  batch failed: ${(err as Error).message}`)
      }
      done += batch.length
      console.log(
        `  ${known.size} names, ${done}/${missing.length} attempted${failed ? `, ${failed} lost` : ''}`,
      )
    }
  })
  await Promise.all(workers)
  return known
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

  /**
   * Every loggable row goes to the model, but for two different reasons: the
   * unnamed ones need a name, the named ones need the words people actually
   * type. The taxonomy calls rocket "Ruchetta" and offers no Italian synonyms
   * at all, so without this pass a search for "rucola" finds Coca-Cola on a
   * trigram fluke and the salad three rows down.
   */
  const loggable = candidates.filter((c) => isLoggable(nutrients.get(c.ciqualCode)))
  const unnamed = loggable.filter((c) => !c.nameIt).length
  console.log(
    `italian names: ${loggable.length - unnamed} from the taxonomy, ${unnamed} to translate, ${loggable.length} to collect aliases for`,
  )

  let translations = await loadTranslations()
  if (useLlm && loggable.length > 0) {
    const options = translatorFromEnv()
    if (!options) {
      console.warn(
        'no CATALOGUE_LLM_* or VISION_* credentials — run with --no-llm to accept a taxonomy-only catalogue',
      )
      process.exit(1)
    }
    console.log(`translating with ${options.model}`)
    translations = await translateAll(
      loggable.map((c) => {
        const ciqual = foods.get(c.ciqualCode)
        return {
          code: c.ciqualCode,
          nameEn: c.nameEn ?? ciqual?.nameEn ?? c.tag.replace(/^\w+:/, ''),
          nameFr: ciqual?.nameFr,
          nameIt: c.nameIt ?? undefined,
        }
      }),
      createTranslator(options),
      translations,
    )
  }

  const built: CatalogueFood[] = []
  for (const candidate of candidates) {
    const food = buildFood({
      candidate,
      nutrients: nutrients.get(candidate.ciqualCode),
      translation: translations.get(candidate.ciqualCode),
    })
    if (food) built.push(food)
  }

  const catalogue = dedupeByName(built)
  if (catalogue.length < built.length) {
    console.log(`dropped ${built.length - catalogue.length} same-name rows`)
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
