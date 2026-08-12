import { sql as raw } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { db } from '../db/index.js'

/** True when a test database was configured; the route suites skip without one. */
export const hasDb = Boolean(process.env.TEST_DATABASE_URL)

/** Everything a test can dirty. Ordered by nothing — cascade sorts it out. */
const TABLES = [
  'app_releases',
  'reminders',
  'push_subscriptions',
  'scan_events',
  'grocery_items',
  'favorites',
  'food_touches',
  'diary_entries',
  'weight_logs',
  'food_images',
  'foods',
  'family_invites',
  'family_members',
  'families',
  'profiles',
  'users',
]

export async function resetDb() {
  await db.execute(
    raw`truncate table ${raw.raw(TABLES.map((t) => `"${t}"`).join(', '))} cascade`,
  )
}

export async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}

export async function stopApp(app: FastifyInstance) {
  await app.close()
}

export interface TestUser {
  token: string
  id: string
  email: string
  password: string
}

let seq = 0

/** Registers a fresh account and returns its token. */
export async function createUser(
  app: FastifyInstance,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  seq += 1
  const email = overrides.email ?? `user${seq}@calorico.test`
  const password = overrides.password ?? 'test-password-1'

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, name: overrides.name ?? `User ${seq}` },
  })
  if (res.statusCode !== 201) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`)
  }

  const body = res.json() as { token: string; user: { id: string } }
  return { token: body.token, id: body.user.id, email, password }
}

export function auth(user: TestUser) {
  return { authorization: `Bearer ${user.token}` }
}
