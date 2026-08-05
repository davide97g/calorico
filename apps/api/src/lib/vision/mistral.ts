import { Mistral } from '@mistralai/mistralai'
import { MEAL_PROMPT } from './prompt.js'
import { MEAL_SCHEMA, parseAnalysis } from './schema.js'
import { VisionError, type MealPhoto, type RawAnalysis, type VisionProvider } from './types.js'

interface Options {
  apiKey: string
  model: string
  timeoutMs: number
}

/**
 * The reply is a schema-constrained JSON document, but the SDK types the content
 * as either a plain string or a list of chunks depending on the model, so flatten
 * before parsing rather than assuming.
 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((chunk) =>
      chunk && typeof chunk === 'object' && 'text' in chunk
        ? String((chunk as { text: unknown }).text ?? '')
        : '',
    )
    .join('')
}

/**
 * Worth a second attempt: rate limiting and upstream faults. A timeout is not —
 * retrying it doubles a wait the user is already staring at — and neither is a
 * malformed body, which will be malformed again.
 */
function isRetryable(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' && (status === 429 || status >= 500)
}

export function mistralProvider(options: Options): VisionProvider {
  const client = new Mistral({ apiKey: options.apiKey })

  async function call(photo: MealPhoto): Promise<unknown> {
    // The SDK does not take an AbortSignal on every path, so the timeout is
    // enforced from the outside — an unbounded vision call would otherwise hold
    // a request open until Fastify gives up.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new VisionError('vision request timed out')),
        options.timeoutMs,
      ),
    )

    const request = client.chat.complete({
      model: options.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: MEAL_PROMPT },
            {
              type: 'image_url',
              imageUrl: `data:${photo.contentType};base64,${photo.base64}`,
            },
          ],
        },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'meal_analysis',
          schemaDefinition: MEAL_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })

    const result = await Promise.race([request, timeout])
    const raw = textOf(result.choices?.[0]?.message?.content)
    if (!raw.trim()) throw new VisionError('empty vision response')

    try {
      return JSON.parse(raw)
    } catch (err) {
      throw new VisionError('vision response was not valid JSON', err)
    }
  }

  return {
    name: 'mistral',
    async analyzeMeal(photo: MealPhoto): Promise<RawAnalysis> {
      try {
        return parseAnalysis(await call(photo))
      } catch (err) {
        // One retry on a transient upstream failure, the same allowance
        // offFetch gives Open Food Facts.
        if (!isRetryable(err)) {
          throw err instanceof VisionError
            ? err
            : new VisionError('vision request failed', err)
        }
        try {
          return parseAnalysis(await call(photo))
        } catch (retryErr) {
          throw retryErr instanceof VisionError
            ? retryErr
            : new VisionError('vision request failed', retryErr)
        }
      }
    },
  }
}
