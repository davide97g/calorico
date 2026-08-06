// Must stay first: Sentry patches the modules everything below imports.
import './instrument.js'
import * as Sentry from '@sentry/node'
import { buildApp } from './app.js'
import { env } from './env.js'
import { sql } from './db/index.js'
import { startReminderScheduler } from './lib/reminders/scheduler.js'

const app = await buildApp()

// Started here rather than inside buildApp: the test suite builds the app for
// every file and must not end up with timers sending real pushes.
const stopReminders = startReminderScheduler(app.log)

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  stopReminders()
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
