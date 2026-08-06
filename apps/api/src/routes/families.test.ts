import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

/**
 * Sharing is the one place in this API where a row does not have exactly one
 * owner, so it is the one place an authorisation mistake leaks another
 * household's data. These tests exist to catch that, not to describe the happy
 * path.
 */
describe.skipIf(!hasDb)('family sharing', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
  })

  const createFamily = async (user: TestUser, name = 'Casa') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/families',
      headers: auth(user),
      payload: { name },
    })
    expect(res.statusCode).toBe(201)
    return (res.json() as { id: string }).id
  }

  const inviteToken = async (user: TestUser, familyId: string) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/families/${familyId}/invites`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(201)
    return (res.json() as { token: string }).token
  }

  const addGrocery = async (user: TestUser, name: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery',
      headers: auth(user),
      payload: { name, quantity: 1 },
    })
    expect(res.statusCode).toBe(201)
    return res.json() as { id: string }
  }

  const groceryNames = async (user: TestUser) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/grocery',
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return (res.json() as { items: { nameSnapshot: string }[] }).items.map(
      (i) => i.nameSnapshot,
    )
  }

  it('keeps two households from seeing each other', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    await createFamily(alice, 'Casa Alice')
    await createFamily(bob, 'Casa Bob')

    await addGrocery(alice, 'Latte')
    await addGrocery(bob, 'Pane')

    expect(await groceryNames(alice)).toEqual(['Latte'])
    expect(await groceryNames(bob)).toEqual(['Pane'])
  })

  it('shares the list only after the invite is accepted', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    const familyId = await createFamily(alice)
    await addGrocery(alice, 'Latte')

    expect(await groceryNames(bob)).toEqual([])

    const token = await inviteToken(alice, familyId)
    const accept = await app.inject({
      method: 'POST',
      url: `/api/families/invites/${token}/accept`,
      headers: auth(bob),
    })
    expect(accept.statusCode).toBe(200)

    expect(await groceryNames(bob)).toEqual(['Latte'])
    // And what Bob adds now reaches Alice.
    await addGrocery(bob, 'Pane')
    expect((await groceryNames(alice)).sort()).toEqual(['Latte', 'Pane'])
  })

  it('refuses to let a stranger read or rotate a family invite', async () => {
    const alice = await createUser(app)
    const stranger = await createUser(app)
    const familyId = await createFamily(alice)

    for (const [method, url] of [
      ['GET', `/api/families/${familyId}/invites`],
      ['POST', `/api/families/${familyId}/invites`],
      ['POST', `/api/families/${familyId}/active`],
      ['DELETE', `/api/families/${familyId}/members/me`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: auth(stranger),
      })
      expect(res.statusCode, `${method} ${url}`).toBe(403)
    }

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/families/${familyId}`,
      headers: auth(stranger),
      payload: { name: 'Casa Mia' },
    })
    expect(rename.statusCode).toBe(403)
  })

  it('rejects a revoked invite', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    const familyId = await createFamily(alice)

    const first = await inviteToken(alice, familyId)
    // Rotating the link revokes the previous one.
    await inviteToken(alice, familyId)

    const accept = await app.inject({
      method: 'POST',
      url: `/api/families/invites/${first}/accept`,
      headers: auth(bob),
    })
    expect(accept.statusCode).toBe(404)
    expect(await groceryNames(bob)).toEqual([])
  })

  it('leaves the last member with their shopping list', async () => {
    const alice = await createUser(app)
    const familyId = await createFamily(alice)
    await addGrocery(alice, 'Latte')

    const leave = await app.inject({
      method: 'DELETE',
      url: `/api/families/${familyId}/members/me`,
      headers: auth(alice),
    })
    expect(leave.statusCode).toBe(204)

    // The family is gone, the list is not.
    const families = await app.inject({
      method: 'GET',
      url: '/api/families',
      headers: auth(alice),
    })
    expect((families.json() as { families: unknown[] }).families).toEqual([])
    expect(await groceryNames(alice)).toEqual(['Latte'])
  })

  it('stops sharing with a member who left', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    const familyId = await createFamily(alice)
    const token = await inviteToken(alice, familyId)
    await app.inject({
      method: 'POST',
      url: `/api/families/invites/${token}/accept`,
      headers: auth(bob),
    })

    await app.inject({
      method: 'DELETE',
      url: `/api/families/${familyId}/members/me`,
      headers: auth(bob),
    })

    await addGrocery(alice, 'Latte')
    expect(await groceryNames(bob)).toEqual([])
  })

  it('does not let a member touch another list through a guessed id', async () => {
    const alice = await createUser(app)
    const stranger = await createUser(app)
    await createFamily(alice)
    const item = await addGrocery(alice, 'Latte')

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/grocery/${item.id}`,
      headers: auth(stranger),
      payload: { completed: true },
    })
    expect(patched.statusCode).toBe(404)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/grocery/${item.id}`,
      headers: auth(stranger),
    })
    expect(deleted.statusCode).toBe(404)

    expect(await groceryNames(alice)).toEqual(['Latte'])
  })
})
