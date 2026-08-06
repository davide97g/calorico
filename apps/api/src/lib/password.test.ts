import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(
      false,
    )
  })

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  it('records the parameters it used, so they can be raised later', async () => {
    const stored = await hashPassword('whatever')
    expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '1'])
  })

  /** Accents typed as combining characters must match the composed form. */
  it('normalises unicode before hashing', async () => {
    const stored = await hashPassword('caffé-macchiato')
    expect(await verifyPassword('caffé-macchiato', stored)).toBe(true)
  })

  it('returns false rather than throwing on a malformed hash', async () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$1$2', 'bcrypt$a$b$c$d$e']) {
      expect(await verifyPassword('x', bad)).toBe(false)
    }
  })
})
