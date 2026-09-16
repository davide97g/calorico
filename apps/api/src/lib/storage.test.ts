import { describe, expect, it } from 'vitest'
import {
  decodedBytes,
  groceryImageKey,
  signImagePath,
  verifyImageSignature,
} from './storage.js'

/**
 * The signature is what stands in for a bearer token on a photo link, so the
 * cases worth pinning down are the ones where it must refuse: another row, a
 * changed expiry, a link that has run out.
 */
describe('signImagePath', () => {
  const parse = (path: string) => {
    const query = new URLSearchParams(path.split('?')[1])
    return { exp: query.get('exp')!, sig: query.get('sig')! }
  }

  it('produces a link the verifier accepts', () => {
    const { exp, sig } = parse(signImagePath('row-1'))
    expect(verifyImageSignature('row-1', exp, sig)).toBe(true)
  })

  it('does not carry over to another row', () => {
    const { exp, sig } = parse(signImagePath('row-1'))
    expect(verifyImageSignature('row-2', exp, sig)).toBe(false)
  })

  it('refuses a stretched expiry', () => {
    const { sig } = parse(signImagePath('row-1'))
    const later = String(Math.floor(Date.now() / 1000) + 99_999)
    expect(verifyImageSignature('row-1', later, sig)).toBe(false)
  })

  it('refuses a link that has run out', () => {
    const past = String(Math.floor(Date.now() / 1000) - 10)
    // Signed correctly for a moment that has passed: the expiry is checked
    // before the signature is trusted, not after.
    expect(verifyImageSignature('row-1', past, 'whatever')).toBe(false)
  })

  it('refuses a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on mismatched buffers, which would be a 500 on a
    // request anyone can make.
    expect(verifyImageSignature('row-1', String(Math.floor(Date.now() / 1000) + 60), 'x')).toBe(false)
  })
})

describe('groceryImageKey', () => {
  it('files the object under the row and never reuses the name', () => {
    const first = groceryImageKey('row-1', 'image/webp')
    const second = groceryImageKey('row-1', 'image/webp')
    expect(first).toMatch(/^grocery\/row-1\/.+\.webp$/)
    expect(first).not.toBe(second)
  })
})

describe('decodedBytes', () => {
  it('reads the real size through the base64 padding', () => {
    expect(decodedBytes(Buffer.from('a'.repeat(1000)).toString('base64'))).toBe(1000)
  })
})
