/**
 * Turns the digits of a scanned product into the bars of the symbol they came
 * from, so a food's page can show the code back rather than only spell it out.
 *
 * The output is a real EAN-13 / EAN-8 symbol, not a decorative pattern: another
 * phone pointed at the screen has to be able to read it, which is the whole
 * point of showing it. Anything that is not a well-formed GTIN — wrong length,
 * failed check digit — encodes to nothing, because a symbol nobody can scan is
 * worse than no symbol at all.
 */

// The three alphabets of EAN. Right-hand codes are the inverse of the left odd
// set, which is what lets a reader work out that it is holding the label
// upside down.
const LEFT_ODD = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
]
const LEFT_EVEN = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
]
const RIGHT = LEFT_ODD.map((code) => code.replace(/[01]/g, (bit) => (bit === '1' ? '0' : '1')))

/**
 * In EAN-13 the first digit is never drawn. It is carried by which of the two
 * left alphabets each of the following six digits uses — the reason the number
 * under the bars is thirteen digits long but only twelve of them are bars.
 */
const PARITY = [
  'OOOOOO', 'OOEOEE', 'OOEEOE', 'OOEEEO', 'OEOOEE',
  'OEEOOE', 'OEEEOO', 'OEOEOE', 'OEOEEO', 'OEEOEO',
]

const START = '101'
const MIDDLE = '01010'
/** Modules of blank margin either side. Below ~7 a reader loses the edge. */
const QUIET = 10

export type BarcodeBar = {
  /** Left edge, in modules from the start of the quiet zone. */
  x: number
  width: number
  /** Guard bars run past the others, into the row of digits. */
  guard: boolean
}

export type Barcode = {
  symbology: 'ean13' | 'ean8'
  /** The full code, normalised: 13 digits for EAN-13, 8 for EAN-8. */
  digits: string
  /** Total width in modules, quiet zones included. */
  width: number
  bars: BarcodeBar[]
  /**
   * The digits split the way the symbol is drawn: the lone parity digit, then
   * the two halves the middle guard separates.
   */
  groups: string[]
}

/**
 * Checks the last digit against the rest. Weights alternate 3/1 from the right,
 * so where they land depends on the length.
 */
function checkDigit(body: string) {
  const sum = [...body]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10
}

/**
 * Accepts what the scanners and Open Food Facts actually hand us — EAN-13,
 * UPC-A, GTIN-14 with a leading zero, EAN-8 — and reduces it to one of the two
 * symbologies we can draw. Returns null for anything else.
 */
function normalise(raw: string) {
  const digits = raw.replace(/\D/g, '')
  // A GTIN-14 whose packaging indicator is 0, and a 12-digit UPC-A, are both
  // the same number as an EAN-13 with zeros in front.
  const padded =
    digits.length === 14 && digits.startsWith('0')
      ? digits.slice(1)
      : digits.length === 12
        ? `0${digits}`
        : digits
  if (padded.length !== 13 && padded.length !== 8) return null
  if (Number(padded.slice(-1)) !== checkDigit(padded.slice(0, -1))) return null
  return padded
}

export function encodeBarcode(raw: string | null | undefined): Barcode | null {
  const digits = raw ? normalise(raw) : null
  if (!digits) return null

  const ean13 = digits.length === 13
  // Guard flags travel alongside the modules so the renderer can give the
  // guards their descenders without re-deriving where they are.
  let modules = ''
  let guards = ''
  const add = (pattern: string, guard = false) => {
    modules += pattern
    guards += (guard ? '1' : '0').repeat(pattern.length)
  }

  add('0'.repeat(QUIET))
  add(START, true)
  if (ean13) {
    const parity = PARITY[Number(digits[0])]
    for (let i = 1; i <= 6; i += 1) {
      const table = parity[i - 1] === 'O' ? LEFT_ODD : LEFT_EVEN
      add(table[Number(digits[i])])
    }
    add(MIDDLE, true)
    for (let i = 7; i <= 12; i += 1) add(RIGHT[Number(digits[i])])
  } else {
    for (let i = 0; i < 4; i += 1) add(LEFT_ODD[Number(digits[i])])
    add(MIDDLE, true)
    for (let i = 4; i < 8; i += 1) add(RIGHT[Number(digits[i])])
  }
  add(START, true)
  add('0'.repeat(QUIET))

  const bars: BarcodeBar[] = []
  for (let x = 0; x < modules.length; x += 1) {
    if (modules[x] !== '1') continue
    const start = x
    while (modules[x + 1] === '1') x += 1
    bars.push({ x: start, width: x - start + 1, guard: guards[start] === '1' })
  }

  return {
    symbology: ean13 ? 'ean13' : 'ean8',
    digits,
    width: modules.length,
    bars,
    groups: ean13
      ? [digits.slice(0, 1), digits.slice(1, 7), digits.slice(7)]
      : [digits.slice(0, 4), digits.slice(4)],
  }
}
