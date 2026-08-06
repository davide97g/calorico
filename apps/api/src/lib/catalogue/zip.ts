import { inflateRawSync } from 'node:zlib'

/**
 * Just enough ZIP to read the CIQUAL archive.
 *
 * The composition table ships as a five-file zip and the build script needs two
 * of them. Node has no zip reader and pulling a dependency in for a script that
 * runs a few times a year is a poor trade, so the central directory is walked
 * by hand: only "stored" and "deflate" appear in that archive, and both are two
 * lines each.
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

/** Offset of the End Of Central Directory record, searched from the tail. */
function findEocd(buf: Buffer): number {
  // The record is 22 bytes plus an optional comment of up to 64 KiB.
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i
  }
  throw new Error('not a zip file: no end-of-central-directory record')
}

/**
 * Extracts the named entries. Missing names throw rather than resolving to
 * undefined — every caller here treats a missing file as a broken download.
 */
export function readZipEntries(
  buf: Buffer,
  names: string[],
): Map<string, Buffer> {
  const eocd = findEocd(buf)
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)

  const wanted = new Set(names)
  const out = new Map<string, Buffer>()

  for (let i = 0; i < count && wanted.size > out.size; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`corrupt central directory at entry ${i}`)
    }
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLength = buf.readUInt16LE(offset + 28)
    const extraLength = buf.readUInt16LE(offset + 30)
    const commentLength = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (wanted.has(name)) {
      // The local header repeats the name and carries its own extra field,
      // which is routinely a different length from the central one.
      const localNameLength = buf.readUInt16LE(localOffset + 26)
      const localExtraLength = buf.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const raw = buf.subarray(start, start + compressedSize)
      out.set(
        name,
        method === 0 ? Buffer.from(raw) : inflateRawSync(raw),
      )
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  const missing = names.filter((n) => !out.has(n))
  if (missing.length > 0) {
    throw new Error(`zip is missing ${missing.join(', ')}`)
  }
  return out
}
