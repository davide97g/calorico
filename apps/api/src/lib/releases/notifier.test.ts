import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { appReleases, profiles, pushSubscriptions } from '../../db/schema.js'
import {
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../../test/harness.js'
import type { PushPayload } from '../push/send.js'
import type { Sender } from '../push/fanout.js'
import { announcePending, fetchDeployedBuild, recordRelease } from './notifier.js'

describe('fetchDeployedBuild', () => {
  it('answers null when nothing is listening', async () => {
    // Port 1 refuses immediately; the timeout is only the backstop.
    expect(await fetchDeployedBuild('http://127.0.0.1:1', 500)).toBeNull()
  })
})

/**
 * The release notice, against a real Postgres — the parts worth testing are all
 * database decisions: which devices count as behind, and the write that makes an
 * announcement happen exactly once.
 */
describe.skipIf(!hasDb)('release notifier', () => {
  let app: FastifyInstance
  let user: TestUser

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
    user = await createUser(app)
    await db
      .update(profiles)
      .set({ notificationsEnabled: true })
      .where(eq(profiles.userId, user.id))
  })

  /** A registered browser, running `buildId` (null = never reported one). */
  async function addDevice(name: string, buildId: string | null) {
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint: `https://push.example.test/${name}`,
      p256dh: 'client-public-key',
      auth: 'client-secret',
      buildId,
    })
  }

  /** Records what would have been pushed, so nothing leaves the process. */
  function recorder(result: 'sent' | 'gone' | 'failed' = 'sent') {
    const calls: PushPayload[] = []
    const send: Sender = async (_target, payload) => {
      calls.push(payload)
      return result
    }
    return { calls, send }
  }

  it('records the first build it ever sees without announcing it', async () => {
    await addDevice('phone', null)

    const created = await recordRelease('build-1')
    expect(created?.announcedAt).not.toBeNull()

    const { calls, send } = recorder()
    expect(await announcePending(0, send)).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('notifies only the devices that are behind', async () => {
    await recordRelease('build-1')
    await addDevice('old-phone', 'build-1')
    await addDevice('never-reported', null)
    await addDevice('already-updated', 'build-2')

    expect(await recordRelease('build-2')).toMatchObject({
      buildId: 'build-2',
      announcedAt: null,
    })

    const { calls, send } = recorder()
    const result = await announcePending(0, send)

    expect(result).toMatchObject({ buildId: 'build-2', targets: 2, sent: 2 })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      kind: 'release',
      url: '/',
      tag: 'calorico-release',
    })
  })

  it('announces a release once', async () => {
    await recordRelease('build-1')
    await addDevice('phone', 'build-1')
    await recordRelease('build-2')

    const { send } = recorder()
    expect((await announcePending(0, send))?.sent).toBe(1)
    // Nothing left unannounced, even though the device is still on the old build
    // — it will pick the new one up the next time it is opened.
    expect(await announcePending(0, send)).toBeNull()

    const [row] = await db
      .select({ notified: appReleases.notified })
      .from(appReleases)
      .where(eq(appReleases.buildId, 'build-2'))
    expect(row?.notified).toBe(1)
  })

  it('holds a release back until the delay has passed', async () => {
    await recordRelease('build-1')
    await addDevice('phone', 'build-1')
    await recordRelease('build-2')

    const { calls, send } = recorder()
    expect(await announcePending(10, send)).toBeNull()
    expect(calls).toHaveLength(0)
    // Still unclaimed, so the pass after the window still has it to send.
    expect((await announcePending(0, send))?.sent).toBe(1)
  })

  it('skips an account that turned notifications off', async () => {
    await recordRelease('build-1')
    await addDevice('phone', 'build-1')
    await db
      .update(profiles)
      .set({ notificationsEnabled: false })
      .where(eq(profiles.userId, user.id))
    await recordRelease('build-2')

    const { calls, send } = recorder()
    expect(await announcePending(0, send)).toMatchObject({ targets: 0, sent: 0 })
    expect(calls).toHaveLength(0)
  })

  it('drops a subscription the push service says is gone', async () => {
    await recordRelease('build-1')
    await addDevice('dead-phone', 'build-1')
    await recordRelease('build-2')

    const { send } = recorder('gone')
    expect(await announcePending(0, send)).toMatchObject({
      sent: 0,
      removed: 1,
      failed: 1,
    })

    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id))
    expect(rows).toHaveLength(0)
  })

  it('treats a build id it has seen before as no release at all', async () => {
    await recordRelease('build-1')
    await recordRelease('build-2')
    await addDevice('phone', 'build-2')
    const { send } = recorder()
    await announcePending(0, send)

    // A rollback: build-1 is deployed again. Nothing is announced.
    expect(await recordRelease('build-1')).toBeNull()
    expect(await announcePending(0, send)).toBeNull()
  })
})
