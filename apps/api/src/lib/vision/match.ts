import type { Food } from '../../db/schema.js'
import { cacheFoods } from '../food-cache.js'
import { searchLocalFoods } from '../food-search.js'
import { searchOff } from '../off.js'
import type { AnalyzedItem, RawAnalysis } from './types.js'

/**
 * Below this score the "match" is usually a different food that happens to
 * share a word — "riso" matching "risotto ai funghi surgelato".
 *
 * Chosen from measured scores over the seeded catalogue (see the `score`
 * comment in lib/food-search.ts for how it is computed). Right answers landed
 * at 0.73-1.00, wrong ones at 0.21-0.64, with a handful of right answers in
 * between ("patate lesse" -> "Patate bollite", 0.54).
 *
 * Deliberately set above that grey zone rather than through the middle of it,
 * because the two errors do not cost the same. A false negative shows the food
 * as an estimate with the real candidates listed underneath — one tap to fix,
 * and visibly unfinished. A false positive silently preselects the wrong food
 * and quietly logs the wrong calories.
 *
 * Still the number in this feature most likely to need moving; move it against
 * measurements, not vibes.
 */
const MATCH_THRESHOLD = 0.65

/** How many alternatives the review screen offers when swapping a food. */
const CANDIDATE_COUNT = 3

export interface MatchedItem extends AnalyzedItem {
  /** Best guesses from the catalogue, best first. May be empty. */
  candidates: Food[]
  /** True when `candidates[0]` cleared the threshold and should be preselected. */
  matched: boolean
}

export interface MatchedAnalysis {
  items: MatchedItem[]
  labelText: string | null
}

async function matchOne(
  item: AnalyzedItem,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<MatchedItem> {
  let hits = await searchLocalFoods(item.searchQuery, CANDIDATE_COUNT)
  const best = () => hits[0]?.score ?? 0

  // A photographed branded product should land on the real product, so give
  // Open Food Facts the same chance the search screen already gives it.
  if (item.packaged && best() < MATCH_THRESHOLD) {
    try {
      const remote = await searchOff(item.searchQuery, CANDIDATE_COUNT)
      if (remote.length > 0) {
        await cacheFoods(remote)
        hits = await searchLocalFoods(item.searchQuery, CANDIDATE_COUNT)
      }
    } catch (err) {
      log.warn({ err, query: item.searchQuery }, 'OFF lookup failed for photo item')
    }
  }

  const candidates = hits.map(({ score: _score, ...food }) => food as Food)
  return { ...item, candidates, matched: best() >= MATCH_THRESHOLD }
}

/**
 * Attaches catalogue candidates to every analysed item. Items are independent,
 * so they run together — each is a handful of indexed queries.
 */
export async function matchAnalysis(
  analysis: RawAnalysis,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<MatchedAnalysis> {
  return {
    items: await Promise.all(analysis.items.map((item) => matchOne(item, log))),
    labelText: analysis.labelText,
  }
}
