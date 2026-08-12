import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql as raw } from 'drizzle-orm'
import { adminDb, adminSql } from './index.js'

/**
 * Runs on every container boot (see Dockerfile CMD). Idempotent.
 * pg_trgm has to exist before the migration that creates the GIN indexes.
 */
async function main() {
  await adminDb.execute(raw`create extension if not exists pg_trgm`)
  await adminDb.execute(raw`create extension if not exists unaccent`)
  await migrate(adminDb, { migrationsFolder: './drizzle' })
  console.log('migrations applied')
  await adminSql.end()
}

main().catch((err) => {
  console.error('migration failed', err)
  process.exit(1)
})
