/**
 * Reader for the Open Food Facts categories taxonomy.
 *
 * OFF's product archive is packaged goods only — searching it for "pesca"
 * returns iced tea and jam, never the fruit. The taxonomy is the part of OFF
 * that does know about plain food: ~3 000 of its 14 600 categories carry a
 * CIQUAL composition code, and ~700 of those are already named in Italian.
 * Those pairings are what this module extracts; ciqual.ts supplies the numbers.
 *
 * Source: Open Food Facts, ODbL.
 */

export interface TaxonomyEntry {
  name?: Record<string, string>
  synonyms?: Record<string, string[]>
  parents?: string[]
  children?: string[]
  ciqual_food_code?: Record<string, string>
  ciqual_proxy_food_code?: Record<string, string>
}

export type Taxonomy = Record<string, TaxonomyEntry>

export interface CategoryCandidate {
  /** OFF tag, e.g. `en:peaches`. */
  tag: string
  ciqualCode: string
  /** True when the code describes a near-enough food, not this exact one. */
  proxy: boolean
  /** From `name.it`; absent for roughly three quarters of the codes. */
  nameIt: string | null
  nameEn: string | null
  synonymsIt: string[]
  synonymsEn: string[]
  /** Every ancestor tag, this one included — used for grouping and drinks. */
  ancestors: string[]
}

/**
 * Ancestors, deduplicated, breadth-first, self first. Cycles are not supposed
 * to exist in the taxonomy but a `seen` set costs nothing and a hang costs a
 * build.
 */
function ancestorsOf(taxonomy: Taxonomy, tag: string): string[] {
  const seen = new Set<string>([tag])
  const queue = [tag]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const parent of taxonomy[current]?.parents ?? []) {
      if (seen.has(parent)) continue
      seen.add(parent)
      queue.push(parent)
    }
  }
  return [...seen]
}

/**
 * Two OFF categories often share one CIQUAL code — `en:strawberries` and
 * `en:fresh-strawberries` both resolve to "Strawberry, raw". Logging them as
 * two foods would put near-duplicates in every search, so the code is the
 * identity and this decides which category speaks for it: an Italian name
 * first, then a measured code over a proxy, then the shorter tag
 * (`en:strawberries` over `en:fresh-strawberries`).
 *
 * The name outranks the proxy flag deliberately. `en:peaches` is named
 * "Pesche" but only carries a proxy code, while `en:fresh-peaches` has the
 * measured one and no Italian name at all; ranking precision first handed the
 * slot to the unnamed category and dropped the peach out of the catalogue
 * entirely. A proxy row is the same food measured slightly differently — a
 * missing row is nothing.
 */
function isBetter(next: CategoryCandidate, current: CategoryCandidate) {
  const nextNamed = next.nameIt != null
  const currentNamed = current.nameIt != null
  if (nextNamed !== currentNamed) return nextNamed
  if (next.proxy !== current.proxy) return current.proxy
  return next.tag.length < current.tag.length
}

/**
 * Language-prefixed tags exist for foods with no English concept. Italian ones
 * are worth keeping (`it:pesca-di-delia`); French and German regional
 * specialities are noise in an Italian food diary.
 */
function isUsableTag(tag: string) {
  return tag.startsWith('en:') || tag.startsWith('it:')
}

export function collectCandidates(taxonomy: Taxonomy): CategoryCandidate[] {
  const byCiqual = new Map<string, CategoryCandidate>()

  for (const [tag, entry] of Object.entries(taxonomy)) {
    if (!isUsableTag(tag)) continue

    const measured = entry.ciqual_food_code?.['en']
    const code = measured ?? entry.ciqual_proxy_food_code?.['en']
    if (!code) continue

    const candidate: CategoryCandidate = {
      tag,
      ciqualCode: code.trim(),
      proxy: measured == null,
      nameIt: entry.name?.['it']?.trim() || null,
      nameEn: entry.name?.['en']?.trim() || null,
      synonymsIt: entry.synonyms?.['it'] ?? [],
      synonymsEn: entry.synonyms?.['en'] ?? [],
      ancestors: [],
    }

    const existing = byCiqual.get(candidate.ciqualCode)
    if (!existing || isBetter(candidate, existing)) {
      byCiqual.set(candidate.ciqualCode, candidate)
    }
  }

  // Ancestors are resolved after the winners are known: walking the tree for
  // all 14 600 entries to then discard four fifths of them is wasted work.
  for (const candidate of byCiqual.values()) {
    candidate.ancestors = ancestorsOf(taxonomy, candidate.tag)
  }

  return [...byCiqual.values()].sort((a, b) =>
    a.ciqualCode.localeCompare(b.ciqualCode),
  )
}
