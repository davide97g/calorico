import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql as raw } from 'drizzle-orm'
import { db, sql } from './index.js'

/**
 * Runs on every container boot (see Dockerfile CMD). Idempotent.
 * pg_trgm has to exist before the migration that creates the GIN indexes.
 */
async function main() {
  await db.execute(raw`create extension if not exists pg_trgm`)
  await db.execute(raw`create extension if not exists unaccent`)
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('migrations applied')
  await sql.end()
}

main().catch((err) => {
  console.error('migration failed', err)
  process.exit(1)
})
