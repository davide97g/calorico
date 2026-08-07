/**
 * Regenerates apps/web/security-headers-marketing.conf.
 *
 * The landing page carries three `application/ld+json` blocks. A browser never
 * executes them, but CSP does not care about that — `script-src` covers every
 * `<script>` element, so under `script-src 'self'` Chrome drops all three and
 * the page loses its structured data without a single visible symptom.
 *
 * The fix is a hash per block. The alternative, `'unsafe-inline'`, would apply
 * to an origin that also holds a session token in localStorage, which is a poor
 * trade for three blobs of JSON.
 *
 * Run after editing any JSON-LD on the landing page:
 *   npm run csp:hashes
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LANDING = resolve(root, 'apps/web/public/landing.html')
const OUT = resolve(root, 'apps/web/security-headers-marketing.conf')

const html = readFileSync(LANDING, 'utf8')

/**
 * The hash is over the element's text content exactly as it sits in the file:
 * every space and newline between `>` and `</script>` counts. Reformatting the
 * JSON — or letting an editor strip trailing whitespace — invalidates it.
 */
const blocks = [
  ...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g,
  ),
].map((m) => m[1])

if (blocks.length === 0) {
  console.error('No JSON-LD found in landing.html — refusing to write an empty policy.')
  process.exit(1)
}

for (const block of blocks) {
  try {
    JSON.parse(block)
  } catch (err) {
    console.error(`Invalid JSON-LD in landing.html: ${err.message}`)
    process.exit(1)
  }
}

const hashes = blocks
  .map((b) => `'sha256-${createHash('sha256').update(b, 'utf8').digest('base64')}'`)
  .join(' ')

const conf = `# Security headers for the static pages served outside the app shell:
# the landing page, the privacy notice and the terms.
#
# GENERATED FILE — do not edit by hand. Run \`npm run csp:hashes\` after changing
# any JSON-LD on the landing page, or the structured data stops reaching
# crawlers with no error anywhere.
#
# It differs from security-headers.conf in one way: script-src carries a hash
# for each JSON-LD block. Everything else is tighter than the app's policy,
# because these pages load no images from Open Food Facts and talk to nothing.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'" always;

add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
`

writeFileSync(OUT, conf)
console.log(`security-headers-marketing.conf written — ${blocks.length} JSON-LD blocks hashed.`)
