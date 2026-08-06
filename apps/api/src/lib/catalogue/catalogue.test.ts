import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildFood, isLoggable, pruneCollidingAliases } from './build.js'
import { parseCiqualAlim, parseCiqualCompo, parseTeneur } from './ciqual.js'
import { searchAliases, shelfFor } from './italian.js'
import { collectCandidates, type Taxonomy } from './taxonomy.js'
import { readZipEntries } from './zip.js'

describe('parseTeneur', () => {
  it('reads French decimals', () => {
    expect(parseTeneur('0,63')).toBe(0.63)
    expect(parseTeneur(' 9 ')).toBe(9)
  })

  it('takes the midpoint of a below-the-limit value', () => {
    expect(parseTeneur('< 0,5')).toBe(0.25)
  })

  it('separates "measured as none" from "not measured"', () => {
    expect(parseTeneur('traces')).toBe(0)
    expect(parseTeneur('-')).toBeNull()
    expect(parseTeneur(undefined)).toBeNull()
  })
})

describe('parseCiqualCompo', () => {
  const xml = `<?xml version="1.0"?>
<TABLE>
  <COMPO><alim_code> 13043 </alim_code><const_code> 328 </const_code><teneur> - </teneur></COMPO>
  <COMPO><alim_code> 13043 </alim_code><const_code> 25000 </const_code><teneur> 1,08 </teneur></COMPO>
  <COMPO><alim_code> 13043 </alim_code><const_code> 31000 </const_code><teneur> 9 </teneur></COMPO>
  <COMPO><alim_code> 13043 </alim_code><const_code> 40000 </const_code><teneur> 0,33 </teneur></COMPO>
  <COMPO><alim_code> 13043 </alim_code><const_code> 60002 </const_code><teneur> 12 </teneur></COMPO>
  <COMPO><alim_code> 99999 </alim_code><const_code> 328 </const_code><teneur> 500 </teneur></COMPO>
</TABLE>`

  it('keeps the constituents we log and drops the rest', () => {
    const rows = parseCiqualCompo(xml)
    expect(rows.get('13043')).toEqual({ protein: 1.08, carbs: 9, fat: 0.33 })
  })

  it('ignores codes nothing asked for', () => {
    const rows = parseCiqualCompo(xml, new Set(['13043']))
    expect(rows.has('99999')).toBe(false)
  })
})

describe('parseCiqualAlim', () => {
  it('indexes the food names by code', () => {
    const rows = parseCiqualAlim(`<TABLE>
      <ALIM>
        <alim_code> 13043 </alim_code>
        <alim_nom_fr> Pêche, pulpe et peau, crue </alim_nom_fr>
        <alim_nom_eng> Peach, flesh and skin, raw </alim_nom_eng>
      </ALIM>
    </TABLE>`)
    expect(rows.get('13043')?.nameEn).toBe('Peach, flesh and skin, raw')
  })
})

describe('searchAliases', () => {
  it('produces the other number of the head noun', () => {
    expect(searchAliases('Pesche')).toContain('pesca')
    expect(searchAliases('Pomodoro')).toContain('pomodori')
    // Only the head noun moves, and only when it ends in a vowel that inflects.
    expect(searchAliases('Petto di pollo')).toContain('petti di pollo')
    expect(searchAliases('Purè di patate')).toEqual([])
  })

  it('spells the hard c and g correctly across the change', () => {
    // acciuga/acciughe, crusca/crusche — not "acciugha", not "crusce".
    expect(searchAliases('Acciughe salate')).toContain('acciuga salate')
    expect(searchAliases('Crusca')).toContain('crusche')
  })

  it('leaves foreign extras uninflected', () => {
    const aliases = searchAliases('Mele', [], ['apples'])
    expect(aliases).toContain('mela')
    expect(aliases).toContain('apples')
    expect(aliases).not.toContain('applo')
  })

  it('adds the singular of an English plural', () => {
    // Without it "peach" scores below "peach nectars", which holds the whole
    // word, and the fruit ranks under the drink.
    expect(searchAliases('Pesche', [], ['Peaches'])).toContain('peach')
    expect(searchAliases('Fragole', [], ['Strawberries'])).toContain(
      'strawberry',
    )
    expect(searchAliases('Mele', [], ['Apples'])).toContain('apple')
    // Already singular, and short words are left alone.
    expect(searchAliases('Riso', [], ['Rice'])).toEqual(['risi', 'rice'])
  })

  it('drops the qualifiers people do not type', () => {
    expect(searchAliases('Pesche (fresche, crude)')).toContain('pesche')
  })
})

describe('shelfFor', () => {
  it('puts a food on the shelf its ancestors imply', () => {
    expect(shelfFor(['en:peaches', 'en:fruits', 'en:plant-based-foods'])).toEqual(
      { category: 'Frutta', isLiquid: false, servingSizeG: 150 },
    )
  })

  it('prefers the specific shelf over the broad one above it', () => {
    expect(shelfFor(['en:hams', 'en:charcuterie', 'en:meats']).category).toBe(
      'Salumi',
    )
  })

  it('does not call bread a drink', () => {
    // en:plant-based-foods-and-beverages covers nearly every plant food.
    expect(
      shelfFor(['en:breads', 'en:plant-based-foods-and-beverages']).isLiquid,
    ).toBe(false)
    expect(shelfFor(['en:fruit-juices', 'en:beverages']).isLiquid).toBe(true)
  })
})

describe('collectCandidates', () => {
  const taxonomy: Taxonomy = {
    'en:fruits': { name: { en: 'Fruits', it: 'Frutta' } },
    'en:peaches': {
      name: { en: 'Peaches', it: 'Pesche' },
      parents: ['en:fruits'],
      ciqual_proxy_food_code: { en: '13043' },
    },
    'en:fresh-peaches': {
      name: { en: 'Fresh peaches' },
      parents: ['en:peaches'],
      ciqual_food_code: { en: '13043' },
    },
    'fr:peche-de-nimes': {
      name: { fr: 'Pêche de Nîmes' },
      parents: ['en:peaches'],
      ciqual_food_code: { en: '13043' },
    },
  }

  it('keeps one candidate per composition code, the named one', () => {
    const [candidate, ...rest] = collectCandidates(taxonomy)
    expect(rest).toHaveLength(0)
    expect(candidate?.tag).toBe('en:peaches')
    expect(candidate?.nameIt).toBe('Pesche')
    // Named beats measured: the alternative is no peach in the catalogue.
    expect(candidate?.proxy).toBe(true)
    expect(candidate?.ancestors).toEqual(['en:peaches', 'en:fruits'])
  })

  it('ignores categories with no composition code', () => {
    expect(collectCandidates({ 'en:fruits': { name: { it: 'Frutta' } } })).toEqual(
      [],
    )
  })
})

describe('buildFood', () => {
  const peach = {
    tag: 'en:peaches',
    ciqualCode: '13043',
    proxy: true,
    nameIt: 'Pesche',
    nameEn: 'Peaches',
    synonymsIt: [],
    synonymsEn: [],
    ancestors: ['en:peaches', 'en:fruits'],
  }

  it('derives the energy CIQUAL leaves blank', () => {
    const food = buildFood({
      candidate: peach,
      nutrients: { protein: 1.08, carbs: 9, fat: 0.33 },
    })
    // 4*1.08 + 4*9 + 9*0.33 = 43.3
    expect(food?.kcal100).toBe(43.3)
    expect(food?.category).toBe('Frutta')
    expect(food?.aliases).toContain('pesca')
    // Flagged as a proxy composition, which is what stops the loader from
    // marking the row verified.
    expect(food?.proxy).toBe(true)
  })

  it('prefers the measured energy over the sum', () => {
    const food = buildFood({
      candidate: peach,
      nutrients: { kcal: 39, protein: 1.08, carbs: 9, fat: 0.33 },
    })
    expect(food?.kcal100).toBe(39)
  })

  it('counts the alcohol in a drink', () => {
    const food = buildFood({
      candidate: { ...peach, tag: 'en:red-wines', nameIt: 'Vino rosso' },
      nutrients: { carbs: 2.6, alcohol: 10 },
    })
    expect(food?.kcal100).toBe(80.4)
  })

  it('refuses a row it cannot name or cannot count', () => {
    expect(
      buildFood({ candidate: { ...peach, nameIt: null }, nutrients: { carbs: 9 } }),
    ).toBeNull()
    expect(buildFood({ candidate: peach, nutrients: {} })).toBeNull()
    expect(buildFood({ candidate: peach, nutrients: undefined })).toBeNull()
    // Per-100 g energy above this is a unit mistake in the source.
    expect(buildFood({ candidate: peach, nutrients: { fat: 200 } })).toBeNull()
  })

  it('takes the translated name when the taxonomy has none', () => {
    const food = buildFood({
      candidate: { ...peach, nameIt: null },
      nutrients: { carbs: 9 },
      translation: { name: 'Pesca noce', aliases: ['nettarina'] },
    })
    expect(food?.name).toBe('Pesca noce')
    expect(food?.translated).toBe(true)
    expect(food?.aliases).toContain('nettarina')
  })

  it('agrees with buildFood about which rows are loggable', () => {
    expect(isLoggable({ protein: 1.08, carbs: 9 })).toBe(true)
    expect(isLoggable({})).toBe(false)
    expect(isLoggable(undefined)).toBe(false)
  })
})

describe('pruneCollidingAliases', () => {
  it('removes an alias that is another food name', () => {
    const foods = [
      { ciqual: '1', name: 'Mele', aliases: ['mela', 'apples'] },
      { ciqual: '2', name: 'Mela', aliases: ['mele'] },
      { ciqual: '3', name: 'Pere', aliases: ['pera'] },
    ] as Parameters<typeof pruneCollidingAliases>[0]

    pruneCollidingAliases(foods)
    expect(foods[0]?.aliases).toEqual(['apples'])
    expect(foods[1]?.aliases).toEqual([])
    expect(foods[2]?.aliases).toEqual(['pera'])
  })
})

describe('readZipEntries', () => {
  /** Minimal single-entry archive, deflated, as the CIQUAL download is. */
  function zipOf(name: string, content: string): Buffer {
    const nameBuf = Buffer.from(name, 'utf8')
    const body = deflateRawSync(Buffer.from(content, 'latin1'))

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(0, 42) // local header offset

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(central.length + nameBuf.length, 12)
    eocd.writeUInt32LE(local.length + nameBuf.length + body.length, 16)

    return Buffer.concat([local, nameBuf, body, central, nameBuf, eocd])
  }

  it('inflates the entry it was asked for', () => {
    const zip = zipOf('compo.xml', '<TABLE>Pêche</TABLE>')
    expect(
      readZipEntries(zip, ['compo.xml']).get('compo.xml')?.toString('latin1'),
    ).toBe('<TABLE>Pêche</TABLE>')
  })

  it('says which file is missing rather than returning undefined', () => {
    expect(() => readZipEntries(zipOf('a.xml', 'x'), ['b.xml'])).toThrow(/b\.xml/)
  })
})
