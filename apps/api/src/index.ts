// Must stay first: Sentry patches the modules everything below imports.
import './instrument.js'
import * as Sentry from '@sentry/node'
import { buildApp } from './app.js'
import { env } from './env.js'
import { sql } from './db/index.js'

const app = await buildApp()

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await sql.end({ timeout: 5 })
  // Anything captured in the last moments still has to reach Sentry.
  await Sentry.flush(2000).catch(() => {})
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

try {
  await app.listen({ port: env.PORT, host: env.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
