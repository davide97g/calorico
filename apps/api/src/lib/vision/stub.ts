import { parseAnalysis } from './schema.js'
import type { MealPhoto, RawAnalysis, VisionProvider } from './types.js'

/**
 * A canned reply, for building and demoing the review screen without an API key
 * and without spending anything per photo. Set VISION_PROVIDER=stub.
 *
 * It goes through parseAnalysis like a real reply so the clamps and the parser
 * stay on the exercised path — a fixture that skips them would let the review
 * screen render shapes production can never produce.
 */
const FIXTURE = {
  items: [
    {
      label: 'Pasta al pomodoro (cotta)',
      searchQuery: 'pasta pomodoro',
      quantityG: 220,
      confidence: 'medium',
      basis: 'Copre poco piu di meta di un piatto da 27 cm.',
      isLiquid: false,
      packaged: false,
      nutrients100: {
        kcal100: 158,
        protein100: 5.2,
        carbs100: 27.4,
        fat100: 3.1,
        fiber100: 1.8,
      },
    },
    {
      label: 'Petto di pollo grigliato',
      searchQuery: 'petto pollo',
      quantityG: 130,
      confidence: 'high',
      basis: 'Due fette lunghe circa quanto i rebbi della forchetta.',
      isLiquid: false,
      packaged: false,
      nutrients100: {
        kcal100: 165,
        protein100: 31,
        carbs100: 0,
        fat100: 3.6,
        fiber100: null,
      },
    },
    {
      label: 'Olio extravergine di oliva',
      searchQuery: 'olio oliva',
      quantityG: 10,
      confidence: 'low',
      basis: 'Non visibile direttamente, dedotto dalla lucidita della verdura.',
      isLiquid: true,
      packaged: false,
      nutrients100: {
        kcal100: 884,
        protein100: 0,
        carbs100: 0,
        fat100: 100,
        fiber100: null,
      },
    },
  ],
  labelText: null,
}

export function stubProvider(): VisionProvider {
  return {
    name: 'stub',
    async analyzeMeal(_photo: MealPhoto): Promise<RawAnalysis> {
      // A beat of latency so the loading state is actually visible while
      // developing against it.
      await new Promise((resolve) => setTimeout(resolve, 600))
      return parseAnalysis(FIXTURE)
    },
  }
}
