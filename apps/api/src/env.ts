import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET must be at least 24 chars'),
  /** Comma separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Open Food Facts requires a descriptive User-Agent. */
  OFF_USER_AGENT: z
    .string()
    .default('Calorico/0.1 (personal project; contact: you@example.com)'),
  OFF_BASE_URL: z.string().default('https://world.openfoodfacts.org'),
  /**
   * Text search lives on a separate service (search-a-licious). The legacy
   * /api/v2/search and /cgi/search.pl endpoints answer 503 most of the time.
   */
  OFF_SEARCH_URL: z.string().default('https://search.openfoodfacts.org'),
  /** Set false to run fully offline against the local foods table only. */
  OFF_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  /**
   * Cloudflare R2, for the photos users take of their own foods. All five are
   * required together; leave them unset and photo upload switches itself off.
   */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  /** Public base URL of the bucket: an r2.dev domain or your own. */
  R2_PUBLIC_BASE_URL: z.string().optional(),
  /** Defaults to the account's S3 endpoint; override for a custom jurisdiction. */
  R2_ENDPOINT: z.string().optional(),
  /**
   * Hard ceiling per upload. The browser compresses to a few hundred KB, so
   * this only catches clients that skip or fail that step.
   */
  R2_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(3 * 1024 * 1024),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

const d = parsed.data

/** Present only when the bucket is fully configured. */
const r2 =
  d.R2_ACCOUNT_ID &&
  d.R2_ACCESS_KEY_ID &&
  d.R2_SECRET_ACCESS_KEY &&
  d.R2_BUCKET &&
  d.R2_PUBLIC_BASE_URL
    ? {
        accountId: d.R2_ACCOUNT_ID,
        accessKeyId: d.R2_ACCESS_KEY_ID,
        secretAccessKey: d.R2_SECRET_ACCESS_KEY,
        bucket: d.R2_BUCKET,
        publicBaseUrl: d.R2_PUBLIC_BASE_URL.replace(/\/$/, ''),
        endpoint: (
          d.R2_ENDPOINT ?? `https://${d.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        ).replace(/\/$/, ''),
        maxUploadBytes: d.R2_MAX_UPLOAD_BYTES,
      }
    : null

export const env = {
  ...d,
  corsOrigins: d.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProd: d.NODE_ENV === 'production',
  r2,
}
