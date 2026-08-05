import { z } from 'zod'
import { deriveKcal } from '../nutrition.js'
import type { AnalyzedItem, RawAnalysis } from './types.js'

/**
 * The JSON schema handed to the provider. Written for strict mode, which means
 * every property has to appear in `required` and `additionalProperties` has to
 * be false — optionality is expressed by allowing null, never by omitting a key.
 */
export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'labelText'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'label',
          'searchQuery',
          'quantityG',
          'confidence',
          'basis',
          'isLiquid',
          'packaged',
          'nutrients100',
        ],
        properties: {
          label: {
            type: 'string',
            description:
              'Nome del cibo in italiano, come deve comparire nel diario. Specifica "cotto" o "crudo" quando cambia le calorie.',
          },
          searchQuery: {
            type: 'string',
            description:
              'Due o tre parole chiave per cercare questo cibo in un database. Senza marca, senza aggettivi.',
          },
          quantityG: {
            type: 'number',
            description:
              'Quantita stimata in grammi (millilitri se liquido), come servita nel piatto.',
          },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          basis: {
            type: 'string',
            description:
              'Una frase breve: su cosa si basa la stima della quantita (il piatto, la posata, la confezione).',
          },
          isLiquid: { type: 'boolean' },
          packaged: {
            type: 'boolean',
            description: 'true se e un prodotto confezionato di marca.',
          },
          nutrients100: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['kcal100', 'protein100', 'carbs100', 'fat100', 'fiber100'],
            description: 'Valori per 100 g/ml, non per porzione.',
            properties: {
              kcal100: { type: 'number' },
              protein100: { type: 'number' },
              carbs100: { type: 'number' },
              fat100: { type: 'number' },
              fiber100: { type: ['number', 'null'] },
            },
          },
        },
      },
    },
    labelText: {
      type: ['string', 'null'],
      description:
        'Testo della tabella nutrizionale se leggibile in foto, altrimenti null.',
    },
  },
} as const

/**
 * The model went through a schema-constrained decode, but that only guarantees
 * shape — not that the numbers make sense. Parse defensively.
 */
const nutrients = z.object({
  kcal100: z.number(),
  protein100: z.number(),
  carbs100: z.number(),
  fat100: z.number(),
  fiber100: z.number().nullable().catch(null),
})

const item = z.object({
  label: z.string().min(1).max(160),
  searchQuery: z.string().min(1).max(120),
  quantityG: z.number(),
  confidence: z.enum(['low', 'medium', 'high']).catch('low'),
  basis: z.string().max(300).catch(''),
  isLiquid: z.boolean().catch(false),
  packaged: z.boolean().catch(false),
  nutrients100: nutrients.nullable().catch(null),
})

const reply = z.object({
  items: z.array(item).catch([]),
  labelText: z.string().max(4000).nullable().catch(null),
})

/** Same ceiling the Open Food Facts importer uses to reject junk records. */
const MAX_KCAL_100 = 950
const MIN_QUANTITY_G = 1
const MAX_QUANTITY_G = 2000
/**
 * How far the stated energy may drift from what its own macros imply before we
 * stop believing the whole nutrient block. Real foods land within a few percent;
 * 25% leaves room for alcohol, polyols and rounding without waving through a
 * block where the model transposed a digit.
 */
const ATWATER_TOLERANCE = 0.25

function cleanNutrients(n: z.infer<typeof nutrients>) {
  if (!Number.isFinite(n.kcal100) || n.kcal100 <= 0) return null
  if (n.kcal100 > MAX_KCAL_100) return null
  if ([n.protein100, n.carbs100, n.fat100].some((v) => !Number.isFinite(v) || v < 0))
    return null

  const fromMacros = deriveKcal({
    protein: n.protein100,
    carbs: n.carbs100,
    fat: n.fat100,
  })
  if (fromMacros != null) {
    const drift = Math.abs(fromMacros - n.kcal100) / n.kcal100
    if (drift > ATWATER_TOLERANCE) return null
  }

  return {
    kcal100: n.kcal100,
    protein100: n.protein100,
    carbs100: n.carbs100,
    fat100: n.fat100,
    fiber100:
      n.fiber100 != null && Number.isFinite(n.fiber100) && n.fiber100 >= 0
        ? n.fiber100
        : null,
  }
}

/**
 * Parses and sanity-checks a provider reply. A bad item is dropped, a bad
 * nutrient block is dropped from an otherwise fine item — one implausible
 * number should not cost the user the whole photo.
 */
export function parseAnalysis(payload: unknown): RawAnalysis {
  const parsed = reply.safeParse(payload)
  if (!parsed.success) return { items: [], labelText: null }

  const items: AnalyzedItem[] = []
  for (const raw of parsed.data.items) {
    if (!Number.isFinite(raw.quantityG)) continue
    const quantityG =
      Math.round(
        Math.min(MAX_QUANTITY_G, Math.max(MIN_QUANTITY_G, raw.quantityG)) * 10,
      ) / 10

    items.push({
      label: raw.label.trim(),
      searchQuery: raw.searchQuery.trim(),
      quantityG,
      confidence: raw.confidence,
      basis: raw.basis.trim(),
      isLiquid: raw.isLiquid,
      packaged: raw.packaged,
      nutrients100: raw.nutrients100 ? cleanNutrients(raw.nutrients100) : null,
    })
  }

  return { items, labelText: parsed.data.labelText?.trim() || null }
}
