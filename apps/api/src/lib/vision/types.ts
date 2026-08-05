/**
 * What a vision provider has to be able to do, and nothing more.
 *
 * The JSON schema, the prompt and the sanity checks live outside the adapters
 * (schema.ts / prompt.ts) because none of them are provider-specific — an
 * adapter's only job is to get an image and a schema across the wire and hand
 * back parsed JSON.
 */

export interface MealPhoto {
  /** Raw base64, no data-URI prefix. */
  base64: string
  /** `image/webp` | `image/jpeg` | `image/png` */
  contentType: string
}

/** Per 100 g/ml, matching how everything is stored in `foods`. */
export interface Nutrients100 {
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
  fiber100: number | null
}

export type Confidence = 'low' | 'medium' | 'high'

/** One food the model believes it can see, after parsing and clamping. */
export interface AnalyzedItem {
  /** Italian, as it should read in the diary. */
  label: string
  /** Normalised terms for the trigram search — no brand noise, no adjectives. */
  searchQuery: string
  /** Grams, or millilitres when `isLiquid`. */
  quantityG: number
  confidence: Confidence
  /** One clause naming what the estimate is anchored on. Shown in the UI. */
  basis: string
  isLiquid: boolean
  /** A branded product with a legible label, worth an Open Food Facts lookup. */
  packaged: boolean
  /** The model's own guess, used only when the catalogue has no match. */
  nutrients100: Nutrients100 | null
}

export interface RawAnalysis {
  items: AnalyzedItem[]
  /** Verbatim OCR of a nutrition label, when one is legible. */
  labelText: string | null
}

export interface VisionProvider {
  readonly name: string
  analyzeMeal(photo: MealPhoto): Promise<RawAnalysis>
}

/** Thrown by adapters so the route can answer 502 without leaking provider detail. */
export class VisionError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'VisionError'
  }
}
