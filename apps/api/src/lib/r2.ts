import { randomUUID } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import { env } from '../env.js'

/**
 * Cloudflare R2 over its S3-compatible API.
 *
 * The browser uploads straight to the bucket with a presigned PUT: the photo
 * never passes through the API, which keeps Fastify's body limit low and the
 * VPS out of the upload path. We only hand out URLs, then verify the object
 * landed before recording it.
 */

export const MIME_EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
}

/** 10 minutes is plenty for a phone on a slow connection. */
const SIGNED_URL_TTL_SECONDS = 600

const client = env.r2
  ? new AwsClient({
      accessKeyId: env.r2.accessKeyId,
      secretAccessKey: env.r2.secretAccessKey,
      service: 's3',
      region: 'auto',
    })
  : null

function config() {
  if (!env.r2 || !client) throw new Error('R2 is not configured')
  return { r2: env.r2, client }
}

export const r2Enabled = () => env.r2 !== null

/** `foods/<foodId>/<userId>/<random>.<ext>` — ownership is readable in the key. */
export function buildObjectKey(
  foodId: string,
  userId: string,
  contentType: string,
) {
  const ext = MIME_EXTENSIONS[contentType] ?? 'bin'
  return `foods/${foodId}/${userId}/${randomUUID()}.${ext}`
}

export function isOwnedKey(key: string, foodId: string, userId: string) {
  return (
    key.startsWith(`foods/${foodId}/${userId}/`) &&
    !key.includes('..') &&
    key.length < 200
  )
}

export function publicUrl(key: string) {
  return `${config().r2.publicBaseUrl}/${key}`
}

function objectUrl(key: string) {
  const { r2 } = config()
  return `${r2.endpoint}/${r2.bucket}/${key}`
}

/**
 * Presigned PUT. The client must send exactly the returned content type, since
 * it is part of the signature.
 */
export async function signUpload(key: string, contentType: string) {
  const { client } = config()
  const url = new URL(objectUrl(key))
  url.searchParams.set('X-Amz-Expires', String(SIGNED_URL_TTL_SECONDS))

  const signed = await client.sign(
    new Request(url, { method: 'PUT', headers: { 'content-type': contentType } }),
    { aws: { signQuery: true, allHeaders: false } },
  )

  return {
    uploadUrl: signed.url,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    headers: { 'content-type': contentType },
  }
}

/** Confirms the upload really happened, and how big it ended up. */
export async function headObject(key: string) {
  const { client } = config()
  const res = await client.fetch(objectUrl(key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`)
  const length = Number(res.headers.get('content-length') ?? 0)
  return {
    bytes: Number.isFinite(length) ? length : 0,
    contentType: res.headers.get('content-type') ?? null,
  }
}

export async function deleteObject(key: string) {
  const { client } = config()
  const res = await client.fetch(objectUrl(key), { method: 'DELETE' })
  // 404 means someone already removed it; the row still has to go.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE failed: ${res.status}`)
  }
}
