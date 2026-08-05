import { env } from '../../env.js'
import { mistralProvider } from './mistral.js'
import { openaiProvider } from './openai.js'
import { stubProvider } from './stub.js'
import type { VisionProvider } from './types.js'

export * from './types.js'

let cached: VisionProvider | null | undefined

/**
 * Null when the feature is not configured — the route answers 503 and the UI
 * hides the button, the same way photo upload disappears without R2.
 *
 * Memoised because the Mistral client holds a connection pool; building one per
 * request would be wasteful and would defeat keep-alive.
 */
export function getVisionProvider(): VisionProvider | null {
  if (cached !== undefined) return cached

  const config = env.vision
  if (!config) {
    cached = null
    return cached
  }

  switch (config.provider) {
    case 'openai':
      cached = openaiProvider({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
        baseUrl: config.baseUrl,
      })
      break
    case 'mistral':
      cached = mistralProvider({
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      })
      break
    case 'stub':
      cached = stubProvider()
      break
  }

  return cached
}

export function visionEnabled(): boolean {
  return getVisionProvider() !== null
}
