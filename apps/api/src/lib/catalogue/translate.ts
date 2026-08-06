import OpenAI from 'openai'

/**
 * Italian names for the three quarters of CIQUAL-coded categories the OFF
 * taxonomy never translated.
 *
 * This runs in the build script, never in the API: the output is committed to
 * data/generic-catalogue.json and reviewed as a diff, so a request is paid for
 * once per rebuild and a bad translation is caught before it reaches anybody's
 * search box.
 *
 * Provider is whatever speaks the OpenAI chat-completions dialect, and the
 * model comes from the environment — this file names no model.
 */

export interface TranslationRequest {
  /** CIQUAL code, echoed back so a reordered response still lines up. */
  code: string
  nameEn: string
  /** French CIQUAL name: often the more precise of the two. */
  nameFr?: string | undefined
}

export interface Translation {
  name: string
  aliases: string[]
}

const SYSTEM = `Sei un esperto di alimentazione italiana e traduci nomi di alimenti per il motore di ricerca di un diario alimentare.

Per ogni alimento restituisci:
- "name": il nome italiano comune, come lo scriverebbe un supermercato o una tabella di composizione (es. "Pesca", "Filetto di merluzzo", "Purè di patate"). Minuscolo tranne la prima lettera e i nomi propri. Niente marchi, niente testo tra parentesi, massimo 60 caratteri.
- "aliases": da 1 a 4 forme alternative in minuscolo che un italiano potrebbe digitare per cercarlo (singolare/plurale, sinonimi regionali, nome più corto). Niente ripetizioni del nome.

Se l'alimento non ha un nome italiano sensato, usa la traduzione più letterale possibile.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'name', 'aliases'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const

export interface TranslatorOptions {
  apiKey: string
  model: string
  baseUrl?: string | undefined
  /**
   * Reasoning budget, for models that have one. Naming a food is recall, not
   * thought: at the default budget a batch spends more tokens thinking than
   * answering and runs past any sane timeout — measured at 1 344 reasoning
   * tokens for ten names, against 576 at "low" for the same output.
   *
   * Set CATALOGUE_LLM_EFFORT=none for a provider that rejects the parameter.
   */
  effort?: string | undefined
}

/**
 * Reads the same VISION_* variables the photo feature uses, so a working
 * install needs no extra setup, with CATALOGUE_LLM_* to point the build at a
 * cheaper or bigger model than the one answering user requests.
 */
export function translatorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TranslatorOptions | null {
  const apiKey = env['CATALOGUE_LLM_API_KEY'] || env['VISION_API_KEY']
  const model = env['CATALOGUE_LLM_MODEL'] || env['VISION_MODEL']
  const baseUrl = env['CATALOGUE_LLM_BASE_URL'] || env['VISION_BASE_URL']
  const effort = env['CATALOGUE_LLM_EFFORT'] || 'low'
  if (!apiKey || !model) return null
  return {
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(effort === 'none' ? {} : { effort }),
  }
}

export function createTranslator(options: TranslatorOptions) {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    timeout: 180_000,
    maxRetries: 2,
  })

  /**
   * One batch, keyed by CIQUAL code. Codes the model drops or invents are
   * skipped by the caller rather than guessed at — a mismatched name would put
   * lentil macros behind the word "cetriolo" and nothing downstream could tell.
   */
  return async function translate(
    batch: TranslationRequest[],
  ): Promise<Map<string, Translation>> {
    const result = await client.chat.completions.create({
      model: options.model,
      ...(options.effort
        ? { reasoning_effort: options.effort as 'low' | 'medium' | 'high' }
        : {}),
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify(
            batch.map((item) => ({
              code: item.code,
              en: item.nameEn,
              ...(item.nameFr ? { fr: item.nameFr } : {}),
            })),
          ),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'translations',
          strict: true,
          schema: SCHEMA as unknown as Record<string, unknown>,
        },
      },
    })

    const raw = result.choices[0]?.message?.content
    if (!raw?.trim()) throw new Error('empty translation response')

    const parsed = JSON.parse(raw) as {
      items?: Array<{ code?: string; name?: string; aliases?: string[] }>
    }

    const wanted = new Set(batch.map((item) => item.code))
    const out = new Map<string, Translation>()
    for (const item of parsed.items ?? []) {
      const code = item.code?.trim()
      const name = item.name?.trim()
      if (!code || !name || !wanted.has(code)) continue
      out.set(code, {
        name: name.slice(0, 60),
        aliases: (item.aliases ?? [])
          .map((a) => a.trim().toLowerCase())
          .filter((a) => a.length > 2)
          .slice(0, 4),
      })
    }
    return out
  }
}
