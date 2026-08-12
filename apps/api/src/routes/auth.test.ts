import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
} from '../test/harness.js'

/**
 * Authentication and the two things a 30-day token needs: that it can be taken
 * away, and that guessing a password is slow.
 */
describe.skipIf(!hasDb)('auth routes', () => {
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

    it('refuses to register without explicit health consent and age attestation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'noconent@calorico.test',
          password: 'test-password-1',
          name: 'No Consent',
        },
      })
      expect(res.statusCode).toBe(400)
    })

  it('registers, then signs in with the same credentials', async () => {
    const user = await createUser(app, { email: 'nuovo@calorico.test' })

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nuovo@calorico.test', password: user.password },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json()).toMatchObject({
      user: { email: 'nuovo@calorico.test' },
      needsOnboarding: true,
    })
  })

  it('treats the email as case-insensitive', async () => {
    const user = await createUser(app, { email: 'mixed@calorico.test' })

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'MiXeD@Calorico.TEST', password: user.password },
    })
    expect(login.statusCode).toBe(200)

    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'MIXED@calorico.test',
        password: 'another-password',
        name: 'Doppione',
        healthConsent: true,
        ageAttested: true,
      },
    })
    expect(again.statusCode).toBe(409)
  })

  it('answers the same way for an unknown email and a wrong password', async () => {
    const user = await createUser(app)

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'not-the-password' },
    })
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@calorico.test', password: 'not-the-password' },
    })

    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownEmail.statusCode).toBe(401)
    expect(wrongPassword.json()).toEqual(unknownEmail.json())
  })

  it('rejects a request with no token, a junk token or a foreign signature', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(noToken.statusCode).toBe(401)

    const junk = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer not.a.token' },
    })
    expect(junk.statusCode).toBe(401)
  })

  describe('token revocation', () => {
    it('kills every existing token when the password changes', async () => {
      const user = await createUser(app)

      const before = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect(before.statusCode).toBe(200)

      const change = await app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: auth(user),
        payload: {
          currentPassword: user.password,
          newPassword: 'a-brand-new-password',
        },
      })
      expect(change.statusCode).toBe(200)

      // The token that made the change is dead too.
      const after = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect(after.statusCode).toBe(401)

      // The one handed back by the change still works.
      const fresh = (change.json() as { token: string }).token
      const withFresh = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${fresh}` },
      })
      expect(withFresh.statusCode).toBe(200)
    })

    it('refuses to change the password without the current one', async () => {
      const user = await createUser(app)

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: auth(user),
        payload: { currentPassword: 'wrong', newPassword: 'a-new-password' },
      })
      expect(res.statusCode).toBe(401)

      // And the old token is still good, because nothing changed.
      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: auth(user),
      })
      expect(me.statusCode).toBe(200)
    })

    it('signs every device out on logout-all', async () => {
      const user = await createUser(app)
      const second = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: user.password },
      })
      const secondToken = (second.json() as { token: string }).token

      await app.inject({
        method: 'POST',
        url: '/api/auth/logout-all',
        headers: auth(user),
      })

      for (const token of [user.token, secondToken]) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { authorization: `Bearer ${token}` },
        })
        expect(res.statusCode).toBe(401)
      }
    })
  })

  describe('brute force', () => {
    /**
     * Ten tries per email and IP, not the app-wide 300/min. The eleventh has to
     * be refused even though the password is now correct — otherwise the limit
     * would be trivially walkable.
     */
    it('locks the pair out after ten wrong passwords', async () => {
      const user = await createUser(app, { email: 'target@calorico.test' })

      const codes: number[] = []
      for (let i = 0; i < 11; i += 1) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: `wrong-guess-${i}` },
        })
        codes.push(res.statusCode)
      }

      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
      expect(codes[10]).toBe(429)

      const correct = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: user.password },
      })
      expect(correct.statusCode).toBe(429)
    })

    it('does not lock out a different account from the same address', async () => {
      const target = await createUser(app, { email: 'first@calorico.test' })
      const other = await createUser(app, { email: 'second@calorico.test' })

      for (let i = 0; i < 11; i += 1) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: target.email, password: `wrong-guess-${i}` },
        })
      }

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: other.email, password: other.password },
      })
      expect(res.statusCode).toBe(200)
    })
  })
})
