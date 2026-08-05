import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.js'
import * as schema from './schema.js'

export const sql = postgres(env.DATABASE_URL, {
  max: env.isProd ? 10 : 4,
  transform: { undefined: null },
  // "already exists, skipping" on every boot is noise, not information.
  onnotice: (notice) => {
    if (notice.code === '42710' || notice.code === '42P07') return
    console.warn(`[pg] ${notice.message}`)
  },
})

export const db = drizzle(sql, { schema, casing: 'snake_case' })

export type Db = typeof db
export { schema }
