import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql as raw } from 'drizzle-orm'

/**
 * Brings the test database up to the current schema once per run, the same way
 * the container does on boot. Skipped entirely without TEST_DATABASE_URL, which
 * is what makes `npm test` safe to run on a laptop with no Postgres.
 */
export async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    console.log('TEST_DATABASE_URL not set — skipping the database test suites')
    return
  }

  const sql = postgres(url, { max: 1 })
  const db = drizzle(sql)
  await db.execute(raw`create extension if not exists pg_trgm`)
  await db.execute(raw`create extension if not exists unaccent`)
  await migrate(db, { migrationsFolder: './drizzle' })
  await sql.end()
}
