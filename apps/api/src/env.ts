import 'dotenv/config'
import { z } from 'zod'

/**
 * Compose interpolates an unset variable to an empty string rather than
 * omitting it, so `VISION_PROVIDER: ${VISION_PROVIDER:-}` arrives as `''`.
 * Treat that as "not set" — otherwise an optional enum rejects it and the
 * container dies at boot over a feature nobody turned on.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), inner)

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
   * Error tracking. Unset means Sentry is never initialised and nothing leaves
   * the box — the same all-or-nothing gate the features below use.
   */
  SENTRY_DSN: blankToUndefined(z.string().optional()),
  /** Fraction of requests traced, 0 disables performance data entirely. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  /** Tags events so staging noise is separable from the real thing. */
  SENTRY_ENVIRONMENT: blankToUndefined(z.string().optional()),

  /**
   * Meal photos a free account may analyse, ever. Not a daily allowance: one
   * taste of the feature, then the paywall. Every call costs money upstream and
   * the photo analysis is the only thing premium sells.
   */
  FREE_PHOTO_SCANS: z.coerce.number().int().min(0).default(1),
  /**
   * Burst guard on the analyse route, independent of the daily allowance above:
   * it is per IP rather than per account, and it is what stops one client
   * hammering the provider. Raised by the test suite, which runs dozens of
   * stubbed analyses in a row.
   */
  VISION_MAX_PER_MINUTE: z.coerce.number().int().positive().default(10),

  /**
   * Meal photo analysis. Provider, key and model are required together; leave
   * any of them unset and the photo button never appears — same all-or-nothing
   * gate as R2 above.
   *
   * No model is defaulted on purpose: model names are renamed and retired far
   * faster than this file is edited, and a stale default fails at request time
   * with a confusing 502 instead of at boot with a clear one.
   */
  VISION_PROVIDER: blankToUndefined(
    z.enum(['openai', 'mistral', 'stub']).optional(),
  ),
  VISION_API_KEY: blankToUndefined(z.string().optional()),
  VISION_MODEL: blankToUndefined(z.string().optional()),
  /**
   * Only for `openai`: point the adapter at any host speaking the same
   * chat-completions dialect (Groq, OpenRouter, Together, a local Ollama).
   * Unset means OpenAI itself.
   */
  VISION_BASE_URL: blankToUndefined(z.string().optional()),
  /**
   * Backstop for a client that skipped compression. The browser aims for
   * ~500 KB, which is ~667 KB once base64'd.
   */
  VISION_MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024),
  /** Vision calls are slow; well above the 8s we allow Open Food Facts. */
  VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  /**
   * Web Push. The two keys and the contact subject are required together: with
   * any of them missing the reminder scheduler never starts and the client is
   * told notifications are unavailable, rather than letting users arm reminders
   * that could never be delivered. Generate a pair with `npm run vapid`.
   *
   * Both keys are checked for shape, not just presence. A truncated paste is the
   * one push misconfiguration that looks like working software: the client
   * happily subscribes, `web-push` throws on the first send, and the only
   * symptom is a phone that stays quiet. The lengths are what an uncompressed
   * P-256 point (65 bytes) and its scalar (32 bytes) come to in base64.
   *
   * The private key signs every push; rotating it invalidates nothing stored
   * here, but browsers hold the public key inside their subscription — so after
   * a rotation the push service refuses every send with 403, which drops the
   * subscription and has the browser register again.
   */
  VAPID_PUBLIC_KEY: blankToUndefined(
    z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_\-+/]{87}={0,2}$/,
        'VAPID_PUBLIC_KEY must be the 87-character key printed by `npm run vapid`',
      )
      .optional(),
  ),
  VAPID_PRIVATE_KEY: blankToUndefined(
    z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_\-+/]{43}={0,2}$/,
        'VAPID_PRIVATE_KEY must be the 43-character key printed by `npm run vapid`',
      )
      .optional(),
  ),
  /** Contact for the push services, `mailto:` or an https URL. */
  VAPID_SUBJECT: blankToUndefined(
    z
      .string()
      .trim()
      .regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT must be mailto: or https://')
      .optional(),
  ),
  /**
   * How many reminders one account may keep. The scheduler walks every enabled
   * reminder every minute, so this is the bound on that walk — generous for a
   * person, closed for a script.
   */
  MAX_REMINDERS_PER_USER: z.coerce.number().int().min(1).max(50).default(12),
  /**
   * How many named plates one account may keep. Generous for a person who
   * repeats a dozen breakfasts and lunches; closed for a script.
   */
  MAX_MEALS_PER_USER: z.coerce.number().int().min(1).max(100).default(40),
  /**
   * How late a reminder may still go out. It covers a restart, a deploy or a
   * clock that drifted across the minute the reminder was due; past it the
   * notification is stale enough to be noise and is dropped for the day.
   */
  REMINDER_GRACE_MINUTES: z.coerce.number().int().min(1).max(120).default(10),

  /**
   * Where the web container answers, used for one thing only: reading
   * `/version.json` to learn which build is deployed, so devices still on the
   * previous one can be told there is a new version.
   *
   * Internal, not public — in Compose it is `http://web`, the service name on the
   * private network. Unset switches release notifications off entirely, which is
   * what a dev machine wants: vite serves no version.json.
   */
  WEB_ORIGIN: blankToUndefined(z.string().url().optional()),
  /**
   * How long a newly deployed build waits before its notice goes out.
   *
   * An open app updates itself within a minute of the deploy and reports the new
   * build, so this window is what keeps it out of the notified set — the
   * notification is for the diary sitting closed on a home screen, not for the
   * one the user is looking at. 0 sends on the next pass, which is what the
   * tests use.
   */
  RELEASE_NOTICE_DELAY_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(1440)
    .default(10),

  /**
   * Stripe. Key, price and webhook secret are required together — the same
   * all-or-nothing gate as vision and push. With any of them missing there is
   * no checkout at all: /premium/checkout answers 503 and the client says
   * payments are unavailable instead of handing out premium for free.
   *
   * The webhook secret is not optional-in-practice: without it the endpoint
   * cannot tell a real Stripe event from anyone who found the URL, and that
   * endpoint is what grants premium.
   */
  STRIPE_SECRET_KEY: blankToUndefined(z.string().optional()),
  /** The recurring price the checkout subscribes to, `price_...`. */
  STRIPE_PRICE_ID: blankToUndefined(z.string().optional()),
  STRIPE_WEBHOOK_SECRET: blankToUndefined(z.string().optional()),
  /**
   * Where Stripe sends the browser back to. Must be the public URL of the web
   * app, not the API: the return page is a route in the SPA.
   *
   * The SPA owns the origin root, so this is the bare origin — no base path. A
   * value still carrying the old `/app` suffix would send a paying customer to
   * `/app/premium/return`, which nginx 301s back to the right place, but a
   * redirect in the middle of a Stripe return is a thing to have as a backstop,
   * not to rely on.
   */
  APP_URL: z.string().default('http://localhost:5173'),
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

/** Present only when a DSN is configured. */
const sentry = d.SENTRY_DSN
  ? {
      dsn: d.SENTRY_DSN,
      tracesSampleRate: d.SENTRY_TRACES_SAMPLE_RATE,
      environment: d.SENTRY_ENVIRONMENT ?? d.NODE_ENV,
    }
  : null

/** Present only when a provider, a key and a model are all configured. */
const vision =
  d.VISION_PROVIDER && d.VISION_API_KEY && d.VISION_MODEL
    ? {
        provider: d.VISION_PROVIDER,
        apiKey: d.VISION_API_KEY,
        model: d.VISION_MODEL,
        baseUrl: d.VISION_BASE_URL,
        maxImageBytes: d.VISION_MAX_IMAGE_BYTES,
        timeoutMs: d.VISION_TIMEOUT_MS,
      }
    : null

/** Present only when both keys and a contact subject are configured. */
const push =
  d.VAPID_PUBLIC_KEY && d.VAPID_PRIVATE_KEY && d.VAPID_SUBJECT
    ? {
        publicKey: d.VAPID_PUBLIC_KEY,
        privateKey: d.VAPID_PRIVATE_KEY,
        subject: d.VAPID_SUBJECT,
      }
    : null

/** Present only when the key, the price and the webhook secret are all set. */
const stripe =
  d.STRIPE_SECRET_KEY && d.STRIPE_PRICE_ID && d.STRIPE_WEBHOOK_SECRET
    ? {
        secretKey: d.STRIPE_SECRET_KEY,
        priceId: d.STRIPE_PRICE_ID,
        webhookSecret: d.STRIPE_WEBHOOK_SECRET,
      }
    : null

export const env = {
  ...d,
  appUrl: d.APP_URL.replace(/\/$/, ''),
  /** Null when release notifications are not configured. */
  webOrigin: d.WEB_ORIGIN ? d.WEB_ORIGIN.replace(/\/$/, '') : null,
  corsOrigins: d.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProd: d.NODE_ENV === 'production',
  isTest: d.NODE_ENV === 'test',
  sentry,
  vision,
  push,
  stripe,
}
