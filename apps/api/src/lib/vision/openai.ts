import OpenAI from 'openai'
import { MEAL_PROMPT } from './prompt.js'
import { MEAL_SCHEMA, parseAnalysis } from './schema.js'
import { VisionError, type MealPhoto, type RawAnalysis, type VisionProvider } from './types.js'

interface Options {
  apiKey: string
  model: string
  timeoutMs: number
  /**
   * Anything speaking the OpenAI chat-completions dialect: Groq, OpenRouter,
   * Together, a local Ollama. Unset means OpenAI itself.
   */
  baseUrl?: string | undefined
}

/** Worth one more attempt: rate limiting and upstream faults. */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' && (status === 429 || status >= 500)
}

export function openaiProvider(options: Options): VisionProvider {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    timeout: options.timeoutMs,
    // Retries are handled below, so failures surface as one clear error.
    maxRetries: 0,
  })

  async function call(photo: MealPhoto): Promise<unknown> {
    const result = await client.chat.completions.create({
      model: options.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: MEAL_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:${photo.contentType};base64,${photo.base64}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'meal_analysis',
          strict: true,
          schema: MEAL_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    })

    const choice = result.choices[0]
    // Strict decoding can still stop early on the token cap, which yields
    // truncated — and therefore unparseable — JSON. Say so precisely.
    if (choice?.finish_reason === 'length')
      throw new VisionError('vision response hit the token limit')

    const raw = choice?.message?.content
    if (!raw?.trim()) throw new VisionError('empty vision response')

    try {
      return JSON.parse(raw)
    } catch (err) {
      throw new VisionError('vision response was not valid JSON', err)
    }
  }

  return {
    name: 'openai',
    async analyzeMeal(photo: MealPhoto): Promise<RawAnalysis> {
      try {
        return parseAnalysis(await call(photo))
      } catch (err) {
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
