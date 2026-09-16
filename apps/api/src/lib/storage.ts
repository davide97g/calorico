import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { env } from '../env.js'

/**
 * Object storage for the photos on shopping rows — MinIO, on the same machine.
 *
 * The bucket is never published and the browser never talks to it. That is what
 * keeps the storage swappable: an endpoint, a bucket and two keys are the whole
 * dependency, and a row records the object key, not a URL, so moving the bucket
 * does not rewrite the table.
 *
 * Because the bytes are served by the API, an `<img>` cannot present a bearer
 * token — so the link carries its own short-lived signature instead. See
 * `signImagePath`.
 */

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

let client: S3Client | null = null

/** Null when no bucket is configured, which is the "feature absent" case. */
function s3(): S3Client | null {
  if (!env.storage) return null
  client ??= new S3Client({
    endpoint: env.storage.endpoint,
    region: env.storage.region,
    forcePathStyle: env.storage.forcePathStyle,
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
  })
  return client
}

export const storageEnabled = () => env.storage !== null

/**
 * A fresh key per upload rather than one per row. Overwriting in place would be
 * simpler, but a replaced photo would keep being served from every cache and
 * every open tab that already holds the signed link.
 */
export function groceryImageKey(itemId: string, contentType: string): string {
  const ext = IMAGE_CONTENT_TYPES[contentType] ?? 'bin'
  return `grocery/${itemId}/${randomUUID()}.${ext}`
}

let bucketReady: Promise<void> | null = null

/**
 * Creates the bucket the first time it is needed.
 *
 * MinIO starts empty, and the alternative is a one-shot `mc mb` container in the
 * compose file that everyone forgets when they move the storage. Doing it here
 * means a fresh volume, a restored backup and a different S3 provider all come
 * up the same way. Memoised, not repeated: the head request is a round trip.
 */
async function ensureBucket(s: S3Client, bucket: string): Promise<void> {
  bucketReady ??= (async () => {
    try {
      await s.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      try {
        await s.send(new CreateBucketCommand({ Bucket: bucket }))
      } catch (error) {
        // Another instance won the race, which is a success for our purposes.
        if (!isAlreadyOwned(error)) throw error
      }
    }
  })().catch((error) => {
    // A failed attempt must not be remembered as a done one.
    bucketReady = null
    throw error
  })
  return bucketReady
}

function isAlreadyOwned(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  return name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists'
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const s = s3()
  if (!s || !env.storage) throw new Error('storage is not configured')
  await ensureBucket(s, env.storage.bucket)
  await s.send(
    new PutObjectCommand({
      Bucket: env.storage.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const s = s3()
  if (!s || !env.storage) return null
  try {
    const out = await s.send(
      new GetObjectCommand({ Bucket: env.storage.bucket, Key: key }),
    )
    if (!out.Body) return null
    return {
      body: Buffer.from(await out.Body.transformToByteArray()),
      contentType: out.ContentType ?? 'application/octet-stream',
    }
  } catch (error) {
    // A key on a row whose object is gone is a missing photo, not a 500: the
    // bucket and the table can drift, and a restored database is the normal way
    // for that to happen.
    if (isNotFound(error)) return null
    throw error
  }
}

export async function deleteObject(key: string): Promise<void> {
  const s = s3()
  if (!s || !env.storage) return
  try {
    await s.send(
      new DeleteObjectCommand({ Bucket: env.storage.bucket, Key: key }),
    )
  } catch (error) {
    // Deleting the row matters; deleting the bytes is housekeeping. An object
    // that was already gone must not fail the request that removed the photo.
    if (!isNotFound(error)) throw error
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  return name === 'NoSuchKey' || name === 'NotFound'
}

const sign = (payload: string) =>
  createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url')

/**
 * A link an `<img>` can fetch. The signature covers the row and an expiry, so
 * the link works without a header and stops working on its own — a photo URL
 * lifted out of the DOM is a handle on one row for one hour, not forever.
 */
export function signImagePath(itemId: string): string {
  const ttl = env.storage?.imageTtlSeconds ?? 3600
  const exp = Math.floor(Date.now() / 1000) + ttl
  return `/grocery/${itemId}/image?exp=${exp}&sig=${sign(`${itemId}.${exp}`)}`
}

export function verifyImageSignature(
  itemId: string,
  exp: string,
  sig: string,
): boolean {
  const expiry = Number(exp)
  if (!Number.isFinite(expiry) || expiry < Date.now() / 1000) return false
  const expected = Buffer.from(sign(`${itemId}.${expiry}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** base64 carries 3 bytes per 4 characters, minus the padding. */
export function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}
