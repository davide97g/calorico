import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.js'
import * as schema from './schema.js'

const poolOptions: postgres.Options<{}> = {
  max: env.isProd ? 10 : 4,
  transform: { undefined: null },
  // "already exists, skipping" on every boot is noise, not information.
  onnotice: (notice) => {
    const code = (notice as { code?: string }).code
    // 42701 is the guarded ADD COLUMN in 0014_resync_snapshot, which is a no-op
    // by design and would otherwise report itself four times per boot.
    if (
      code === '42710' ||
      code === '42P07' ||
      code === '25P01' ||
      code === '42701'
    ) {
      return
    }
    console.warn(`[pg] ${(notice as { message?: string }).message ?? notice}`)
  },
}

const adminUrl = env.DATABASE_ADMIN_URL ?? env.DATABASE_URL

/**
 * Owner/superuser pool. Migrations, seed, the reminder scheduler and the
 * Stripe webhook use this so they are not boxed in by row-level security.
 */
export const adminSql = postgres(adminUrl, poolOptions)
export const adminDb = drizzle(adminSql, { schema, casing: 'snake_case' })

/** Same pool as adminSql unless DATABASE_ADMIN_URL points somewhere else. */
export const sql =
  adminUrl === env.DATABASE_URL ? adminSql : postgres(env.DATABASE_URL, poolOptions)

export type Db = typeof adminDb

type ReservedClient = Awaited<ReturnType<typeof sql.reserve>>

export type RlsStore = {
  db: Db
  client: ReservedClient | null
  failed: boolean
}

export const rlsAls = new AsyncLocalStorage<RlsStore>()

function currentDb(): Db {
  return rlsAls.getStore()?.db ?? adminDb
}

/**
 * Request-scoped when an authenticated handler has entered RLS; otherwise the
 * admin connection (login, public invite preview, scripts, tests).
 */
export const db = new Proxy(adminDb, {
  get(_target, prop) {
    const current = currentDb()
    const value = Reflect.get(current, prop, current) as unknown
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(current)
    }
    return value
  },
}) as Db

/**
 * Pin this request to calorico_app on a reserved connection. Session-level SET
 * (not SET LOCAL inside an outer BEGIN): handlers already open their own
 * transactions, and an outer COMMIT would drop the role mid-request.
 *
 * Safe with the pool because the connection is reserved until finishRls RESET.
 */
export async function enterRls(userId: string): Promise<void> {
  const store = rlsAls.getStore()
  if (!store) throw new Error('rls store missing')
  if (store.client) return

  const client = await sql.reserve()
  // postgres.js reserved clients are a thin tagged-template wrapper and do
  // not copy `options` or `begin`; drizzle reads parsers from options and
  // opens transactions with begin().
  client.options = sql.options
  client.begin = (async (fn: (tx: ReservedClient) => unknown) => {
    await client.unsafe('begin')
    try {
      const result = await fn(client)
      await client.unsafe('commit')
      return result
    } catch (err) {
      try {
        await client.unsafe('rollback')
      } catch {
        // Already aborted.
      }
      throw err
    }
  }) as unknown as ReservedClient['begin']
  try {
    await client.unsafe('SET ROLE calorico_app')
    await client`select set_config('app.user_id', ${userId}, false)`
  } catch (err) {
    try {
      await client.unsafe('RESET ROLE')
    } catch {
      // The connection is being released; a second failure is not useful.
    }
    client.release()
    throw err
  }
  store.client = client
  store.db = drizzle(client, { schema, casing: 'snake_case' })
}

export async function finishRls(store: RlsStore | undefined): Promise<void> {
  if (!store?.client) return
  const client = store.client
  store.client = null
  store.db = adminDb
  if (store.failed) {
    try {
      await client.unsafe('ROLLBACK')
    } catch {
      // No transaction in progress, or the connection is already dead.
    }
  }
  try {
    await client.unsafe('RESET ROLE')
    await client`select set_config('app.user_id', '', false)`
  } catch {
    // Already dead.
  }
  client.release()
}

export { schema }
