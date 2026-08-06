/**
 * Reader for the ANSES-CIQUAL 2020 composition table (XML edition).
 *
 * CIQUAL is where the generic half of the catalogue gets its numbers: Open Food
 * Facts knows what a peach *is* — its category carries a CIQUAL code — but not
 * what a peach contains, because nobody scans loose fruit. This module turns
 * `compo_2020_07_07.xml` into per-100 g values keyed by that code.
 *
 * Source: ANSES-CIQUAL 2020, https://ciqual.anses.fr — attribution required.
 *
 * The XML is machine-generated and dead flat (`<COMPO><alim_code/>…</COMPO>`,
 * no attributes worth reading, no nesting), so it is scanned with a regex
 * rather than a parser dependency. That is a deliberate trade for one file
 * whose shape has not changed since 2013, not a general recommendation.
 */

/** Files inside XML_2020_07_07.zip that we read. */
export const CIQUAL_COMPO_FILE = 'compo_2020_07_07.xml'
export const CIQUAL_ALIM_FILE = 'alim_2020_07_07.xml'

/** The archive is windows-1252, which Node spells 'latin1' closely enough. */
export const CIQUAL_ENCODING = 'latin1'

/** Constituent codes, from const_2020_07_07.xml. */
const CONST = {
  kcal: '328', // Energy, Regulation EU No 1169/2011 (kcal/100g)
  kj: '327',
  protein: '25000',
  carbs: '31000',
  sugars: '32000',
  fat: '40000',
  satFat: '40302',
  fiber: '34100',
  salt: '10004',
  alcohol: '60000',
} as const

type Nutrient = keyof typeof CONST
const BY_CODE = new Map<string, Nutrient>(
  Object.entries(CONST).map(([k, v]) => [v, k as Nutrient]),
)

export type CiqualNutrients = Partial<Record<Nutrient, number>>

/**
 * A CIQUAL amount, which is not always a number:
 *
 *   "9"        -> 9
 *   "0,63"     -> 0.63       (French decimal comma)
 *   "< 0,5"    -> 0.25       (below the limit of quantification)
 *   "traces"   -> 0
 *   "-"        -> null       (not measured — different from zero)
 *
 * A "less than" bound is halved rather than taken at face value: reading
 * "< 0,5 g fat" as 0.5 turns a strawberry into a food with more fat than it
 * has, and reading it as 0 claims a precision the table refuses to give. The
 * midpoint is wrong by at most the bound itself, which for every constituent
 * here is a rounding error on a diary entry.
 */
export function parseTeneur(raw: string | undefined): number | null {
  if (!raw) return null
  const text = raw.trim()
  if (text === '' || text === '-') return null
  if (/^traces$/i.test(text)) return 0

  const bounded = text.startsWith('<')
  const value = Number(text.replace('<', '').replace(',', '.').trim())
  if (!Number.isFinite(value)) return null
  return bounded ? value / 2 : value
}

/**
 * Composition rows for the codes asked for. Restricting up front matters: the
 * file holds ~2.9 M rows across 60-odd constituents and keeping all of them
 * would be two orders of magnitude more memory for no gain.
 */
export function parseCiqualCompo(
  xml: string,
  wanted?: Set<string>,
): Map<string, CiqualNutrients> {
  const out = new Map<string, CiqualNutrients>()
  const rows =
    /<COMPO>\s*<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>\s*([^<]*)<\/teneur>/g

  for (const [, alim, constCode, teneur] of xml.matchAll(rows)) {
    if (!alim || !constCode) continue
    if (wanted && !wanted.has(alim)) continue
    const nutrient = BY_CODE.get(constCode)
    if (!nutrient) continue
    const value = parseTeneur(teneur)
    if (value == null) continue

    const entry = out.get(alim) ?? {}
    entry[nutrient] = value
    out.set(alim, entry)
  }
  return out
}

export interface CiqualFood {
  code: string
  nameFr: string
  nameEn: string
}

/** The food list, used only to sanity-check a code and to log what it is. */
export function parseCiqualAlim(xml: string): Map<string, CiqualFood> {
  const out = new Map<string, CiqualFood>()
  const rows = /<ALIM>([\s\S]*?)<\/ALIM>/g
  for (const [, body] of xml.matchAll(rows)) {
    if (!body) continue
    const code = /<alim_code>\s*(\d+)\s*<\/alim_code>/.exec(body)?.[1]
    if (!code) continue
    out.set(code, {
      code,
      nameFr: text(body, 'alim_nom_fr'),
      nameEn: text(body, 'alim_nom_eng'),
    })
  }
  return out
}

function text(body: string, tag: string): string {
  const match = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`).exec(body)
  return match?.[1]?.trim() ?? ''
}
