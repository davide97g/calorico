import { and, desc, eq, isNull, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { adminDb } from '../../db/index.js'
import { appReleases, profiles, pushSubscriptions } from '../../db/schema.js'
import { env } from '../../env.js'
import { fanout, type Sender } from '../push/fanout.js'
import { pushConfigured, sendPush, type PushPayload } from '../push/send.js'

/**
 * "There is a new version — tap to load it."
 *
 * An open app finds a new build on its own: src/lib/pwa.ts polls the worker every
 * minute and either swaps it in silently or offers a toast. What it cannot do is
 * reach an installed diary that is closed, which is where a phone app spends
 * nearly all its time — so a deploy stayed invisible until the user happened to
 * open it. This closes that gap with the push channel reminders already use.
 *
 * Three decisions carry the whole design.
 *
 * **The deployed bundle says what is deployed.** The server polls
 * `WEB_ORIGIN/version.json`, written by the web build itself, rather than trusting
 * a build id from a client — a client-reported version would let anyone with an
 * account push a notification to every device on the server.
 *
 * **Only devices that are behind are told.** Each browser reports the build it is
 * running (`push_subscriptions.build_id`), so a device that already updated itself
 * in the background is skipped. A notification saying "new version" to someone
 * already on it is worse than silence: it teaches them to ignore the next one.
 *
 * **A release is announced once, late.** `app_releases.announced_at` is written
 * before the first push goes out, so a restart cannot re-announce, and the notice
 * waits RELEASE_NOTICE_DELAY_MINUTES — long enough for the apps that are open to
 * update themselves and report it, so they drop out of the set.
 */

/** Devices one announcement may reach. Far above one household. */
const MAX_PER_ANNOUNCE = 1000

const TICK_MS = 60_000

/** version.json is a few bytes on the internal network; it answers or it does not. */
const FETCH_TIMEOUT_MS = 3_000

const versionFile = z.object({
  buildId: z.string().trim().min(1).max(64),
})

/** Italian, and deliberately vague: the payload sits on a lock screen. */
export const releaseMessage: PushPayload = {
  kind: 'release',
  title: 'Nuova versione di Calorico',
  body: 'Tocca per ricaricare l’app e passare all’ultima versione.',
  url: '/',
  tag: 'calorico-release',
}

/**
 * Which build the web container is serving right now, or null if it could not be
 * read — a deploy in progress, a container still starting, a WEB_ORIGIN pointing
 * at nothing. Never throws: this runs on a timer and a missing answer only means
 * "ask again in a minute".
 */
export async function fetchDeployedBuild(
  origin: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/version.json`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const parsed = versionFile.safeParse(await res.json())
    return parsed.success ? parsed.data.buildId : null
  } catch {
    return null
  }
}

/**
 * Notes a build id as deployed, and returns the release row when it was new.
 *
 * The very first build this server ever sees is recorded as already announced.
 * Nobody's device is behind at that point as far as we know — every subscription
 * predates the column that records a build — and announcing it would mean one
 * pointless notification to every phone the first time this code is deployed.
 *
 * A build id that has a row already, which is what a rollback looks like, is not
 * a new release: the row is kept and nothing is sent. That is the quiet choice,
 * and the app still picks the older build up on its own next time it is opened.
 */
export async function recordRelease(buildId: string) {
  const [latest] = await adminDb
    .select({ id: appReleases.id, buildId: appReleases.buildId })
    .from(appReleases)
    .orderBy(desc(appReleases.detectedAt))
    .limit(1)

  if (latest?.buildId === buildId) return null

  const [created] = await adminDb
    .insert(appReleases)
    .values({ buildId, announcedAt: latest ? null : new Date() })
    .onConflictDoNothing({ target: appReleases.buildId })
    .returning({
      id: appReleases.id,
      buildId: appReleases.buildId,
      announcedAt: appReleases.announcedAt,
    })

  return created ?? null
}

export interface AnnounceResult {
  buildId: string
  /** Devices that were behind and reachable. */
  targets: number
  sent: number
  removed: number
  failed: number
}

/**
 * Sends the notice for the newest release that is due one, if any.
 *
 * The claim is a single conditional UPDATE over every unannounced release past
 * the delay, so two API containers cannot both announce, and a server that was
 * down across two deploys announces the newest one only — nobody needs to hear
 * about the version they skipped.
 *
 * Best effort by design: the claim is written before the pushes and is not
 * handed back if they fail. A retry loop here would keep hammering a push
 * service that is refusing us, and the cost of a lost notice is small — the app
 * still updates itself the next time it is opened.
 */
export async function announcePending(
  delayMinutes = env.RELEASE_NOTICE_DELAY_MINUTES,
  send: Sender = sendPush,
): Promise<AnnounceResult | null> {
  const claimed = await adminDb
    .update(appReleases)
    .set({ announcedAt: new Date() })
    .where(
      and(
        isNull(appReleases.announcedAt),
        raw`${appReleases.detectedAt} <= now() - ${delayMinutes} * interval '1 minute'`,
      ),
    )
    .returning({
      id: appReleases.id,
      buildId: appReleases.buildId,
      detectedAt: appReleases.detectedAt,
    })

  if (claimed.length === 0) return null

  const release = claimed.reduce((newest, row) =>
    row.detectedAt > newest.detectedAt ? row : newest,
  )

  const targets = await adminDb
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(profiles, eq(profiles.userId, pushSubscriptions.userId))
    .where(
      and(
        // The master switch covers this too: a user who wants no notifications
        // wants no notifications.
        eq(profiles.notificationsEnabled, true),
        // `is distinct from` rather than `<>`: a device that never reported a
        // build has null there, and null is behind.
        raw`${pushSubscriptions.buildId} is distinct from ${release.buildId}`,
      ),
    )
    .limit(MAX_PER_ANNOUNCE)

  const { sent, removed, failed } = await fanout(targets, releaseMessage, send)

  await adminDb
    .update(appReleases)
    .set({ notified: sent })
    .where(eq(appReleases.id, release.id))

  return {
    buildId: release.buildId,
    targets: targets.length,
    sent,
    removed,
    failed,
  }
}

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

/** One pass: look at what is deployed, then announce whatever is due. */
export async function runReleaseCheck(
  origin: string,
  send: Sender = sendPush,
): Promise<AnnounceResult | null> {
  const buildId = await fetchDeployedBuild(origin)
  if (buildId) await recordRelease(buildId)
  return announcePending(env.RELEASE_NOTICE_DELAY_MINUTES, send)
}

/**
 * Starts the per-minute check. Called from index.ts, like the reminder
 * scheduler, so the test suite never starts a timer.
 *
 * Off unless push is configured and WEB_ORIGIN is set: without either there is
 * nothing to send or nothing to ask, and a dev machine has neither.
 */
export function startReleaseNotifier(log: Logger): () => void {
  const origin = env.webOrigin

  if (!pushConfigured() || !origin) {
    log.info(
      { webOrigin: origin ?? null, push: pushConfigured() },
      'releases: notifier not started (needs VAPID keys and WEB_ORIGIN)',
    )
    return () => {}
  }

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await runReleaseCheck(origin)
      if (result) log.info(result, 'releases: new version announced')
      if (result && result.targets === MAX_PER_ANNOUNCE) {
        log.warn({ cap: MAX_PER_ANNOUNCE }, 'releases: hit the per-announce cap')
      }
    } catch (err) {
      log.error({ err }, 'releases: check failed')
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), TICK_MS)
  // The deploy that started this process is the one to record, and the delay
  // window is counted from when it was first seen — so look immediately.
  void tick()

  log.info(
    { origin, delayMinutes: env.RELEASE_NOTICE_DELAY_MINUTES },
    'releases: notifier started',
  )
  return () => clearInterval(timer)
}
