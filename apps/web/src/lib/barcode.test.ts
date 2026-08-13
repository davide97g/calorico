import { describe, expect, it } from 'vitest'
import { BitArray, EAN13Reader } from '@zxing/library'
import { encodeBarcode } from './barcode'

/** Rebuilds the module string from the bars, to assert on the pattern. */
function modules(code: NonNullable<ReturnType<typeof encodeBarcode>>) {
  const bits = Array.from({ length: code.width }, () => '0')
  for (const bar of code.bars) {
    for (let x = bar.x; x < bar.x + bar.width; x += 1) bits[x] = '1'
  }
  return bits.join('')
}

describe('encodeBarcode', () => {
  it('encodes an EAN-13 to the 95 modules of the standard', () => {
    const code = encodeBarcode('5901234123457')!
    expect(code.symbology).toBe('ean13')
    // 95 modules of symbol, plus a quiet zone on each side.
    expect(code.width - 95).toBe(20)
    const bits = modules(code).slice(10, -10)
    expect(bits).toHaveLength(95)
    expect(bits.startsWith('101')).toBe(true)
    expect(bits.endsWith('101')).toBe(true)
    expect(bits.slice(45, 50)).toBe('01010')
    // First digit 5 selects OEEOOE, so digit two ('9') uses the odd alphabet.
    expect(bits.slice(3, 10)).toBe('0001011')
  })

  it('encodes an EAN-8', () => {
    const code = encodeBarcode('96385074')!
    expect(code.symbology).toBe('ean8')
    expect(code.width - 67).toBe(20)
    expect(code.groups).toEqual(['9638', '5074'])
  })

  it('reads a UPC-A as the EAN-13 it is', () => {
    const code = encodeBarcode('036000291452')!
    expect(code.digits).toBe('0036000291452')
    expect(code.groups[0]).toBe('0')
  })

  it('drops the packaging indicator of a GTIN-14 that has none', () => {
    expect(encodeBarcode('05901234123457')?.digits).toBe('5901234123457')
  })

  it('refuses a code no reader would accept', () => {
    // Wrong check digit: drawing it would hand someone a symbol that fails.
    expect(encodeBarcode('5901234123450')).toBeNull()
    expect(encodeBarcode('12345')).toBeNull()
    expect(encodeBarcode('')).toBeNull()
    expect(encodeBarcode(null)).toBeNull()
  })

  it('ignores separators inside the code', () => {
    expect(encodeBarcode(' 5901234-123457 ')?.digits).toBe('5901234123457')
  })

  it('marks the guards, and only the guards, as tall', () => {
    const code = encodeBarcode('4006381333931')!
    // Start, middle and end: two bars each.
    expect(code.bars.filter((bar) => bar.guard)).toHaveLength(6)
  })

  /**
   * The promise of the feature is that another phone can read the symbol off
   * the screen, so the assertion is the one a scanner makes: hand the bars to
   * the same decoder the app's own scanner uses and get the number back.
   */
  it('is read back as the same number by a real decoder', () => {
    const scan = (raw: string) => {
      const code = encodeBarcode(raw)!
      // Three pixels per module, the way a camera sees more than one.
      const scale = 3
      const row = new BitArray(code.width * scale)
      for (const bar of code.bars) {
        for (let x = bar.x * scale; x < (bar.x + bar.width) * scale; x += 1) row.set(x)
      }
      return new EAN13Reader().decodeRow(1, row, undefined).getText()
    }
    expect(scan('4006381333931')).toBe('4006381333931')
    expect(scan('5901234123457')).toBe('5901234123457')
    // A UPC-A read from a US pack still scans as the code on the pack.
    expect(scan('036000291452')).toBe('0036000291452')
  })
})
