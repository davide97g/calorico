/**
 * Sentry, and nothing else. Imported as the very first thing in index.ts because
 * the SDK's automatic instrumentation has to patch http, pg and friends before
 * anything requires them.
 *
 * With no SENTRY_DSN set this module initialises nothing, and every Sentry call
 * elsewhere in the codebase becomes a no-op.
 */
import * as Sentry from '@sentry/node'
import { env } from './env.js'

if (env.sentry) {
  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    tracesSampleRate: env.sentry.tracesSampleRate,
    // Diaries, weights and email addresses are none of Sentry's business.
    sendDefaultPii: false,
  })
}
