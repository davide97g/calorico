#!/usr/bin/env node
/**
 * Checks that every URL the service worker precaches is actually fetchable.
 *
 * This exists because of a failure with no symptom worth the name. Workbox
 * fetches all of them during install and one bad entry rejects the whole
 * install, so the worker never activates — and a worker that never activates
 * means no push notifications, no offline shell, and, on iOS, a registration the
 * system discards. The app looks fine. `404.html` was the entry that did it:
 * nginx serves it with `internal`, so it answers 404 to anything outside, and
 * every install had been failing on it.
 *
 * Reads the manifest out of the built worker rather than the config, because the
 * question is what shipped, not what was meant.
 *
 * Usage:
 *   node scripts/verify-precache.mjs                       # local dist/
 *   node scripts/verify-precache.mjs https://example.com   # a deployment
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { access } from 'node:fs/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'apps/web/dist')
const origin = process.argv[2]?.replace(/\/$/, '') ?? null

/** How many URLs to have in flight against a live origin at once. */
const CONCURRENCY = 8

/**
 * The manifest comes from whichever worker is being checked — the deployment's
 * own when an origin is given, not the one just built here. Anything else
 * compares one build's asset hashes against another's and reports failures that
 * are only a version skew.
 */
const worker = origin
  ? await fetch(`${origin}/sw.js`)
      .then((res) => (res.ok ? res.text() : null))
      .catch(() => null)
  : await readFile(path.join(dist, 'sw.js'), 'utf8').catch(() => null)

if (!worker) {
  console.error(
    origin ? `could not fetch ${origin}/sw.js` : 'no apps/web/dist/sw.js — run the web build first',
  )
  process.exit(2)
}

// The manifest is a literal array of {url, revision} in the generated worker.
const urls = [...new Set([...worker.matchAll(/\{url:"(.*?)"/g)].map((m) => m[1]))]
if (urls.length === 0) {
  console.error('no precache manifest found in sw.js')
  process.exit(2)
}

/**
 * A redirect is a pass, not a failure: fetch follows it during install and the
 * body that lands in the cache is the right one. `/index.html` is deliberately
 * canonicalised to `/`, and that install works.
 */
async function checkRemote(url) {
  const target = `${origin}/${url}`
  try {
    const res = await fetch(target, { redirect: 'follow' })
    return res.ok ? null : `${res.status}`
  } catch (err) {
    return err.code ?? err.name ?? 'fetch failed'
  }
}

async function checkLocal(url) {
  // Query strings never reach disk; the manifest has none, but be safe.
  const file = path.join(dist, url.split('?')[0])
  try {
    await access(file)
    return null
  } catch {
    return 'missing from dist/'
  }
}

const check = origin ? checkRemote : checkLocal

const failures = []
let index = 0
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (index < urls.length) {
      const url = urls[index++]
      const problem = await check(url)
      if (problem) failures.push({ url, problem })
    }
  }),
)

const where = origin ?? 'dist/'
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${urls.length} precached URLs fail on ${where}:\n`)
  for (const { url, problem } of failures.sort((a, b) => a.url.localeCompare(b.url))) {
    console.error(`  ${problem.padEnd(18)} ${url}`)
  }
  console.error(
    '\nEvery one of these breaks the service worker install, and with it push\n' +
      'notifications and the offline shell. Either serve the URL, or add it to\n' +
      'workbox.globIgnores in apps/web/vite.config.ts.\n',
  )
  process.exit(1)
}

console.log(`all ${urls.length} precached URLs OK on ${where}`)
