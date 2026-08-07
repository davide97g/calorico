/**
 * Refetches the self-hosted webfonts into apps/web/public/fonts.
 *
 * The fonts are committed, so this is not part of the build — it exists so the
 * next person can regenerate them instead of reverse-engineering where a
 * directory of woff2 files came from, and so upgrading a family is one command
 * rather than an afternoon.
 *
 * They are self-hosted rather than linked from fonts.googleapis.com because a
 * stylesheet on that host makes every visitor's browser reveal its IP address
 * to Google before a single pixel is drawn. For a site whose privacy notice
 * claims no third-party requests, that is a contradiction on the first line.
 *
 * Only the latin and latin-ext subsets are kept: the interface is Italian.
 *
 *   node scripts/fetch-fonts.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(root, 'apps/web/public/fonts')
const OUT_CSS = resolve(root, 'apps/web/public/fonts.css')

const CSS_URL =
  'https://fonts.googleapis.com/css2' +
  '?family=Bricolage+Grotesque:opsz,wght@12..96,600..800' +
  '&family=Plus+Jakarta+Sans:wght@400;500;600;700' +
  '&display=swap'

/** Google serves woff2 only to a UA it believes supports it. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const KEEP_SUBSETS = new Set(['latin', 'latin-ext'])

const HEADER = `/* Self-hosted Bricolage Grotesque + Plus Jakarta Sans (SIL Open Font License
   1.1). Served from this origin on purpose: a request to fonts.gstatic.com
   would hand every visitor's IP address to Google, which for an EU site is a
   transfer that needs a legal basis nobody wants to argue for over a webfont.
   Regenerate with \`npm run fonts\`. */

`

const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } })
if (!res.ok) throw new Error(`Google Fonts CSS: HTTP ${res.status}`)
const css = await res.text()

mkdirSync(OUT_DIR, { recursive: true })

// Google emits one @font-face per subset, each preceded by a /* subset */
// comment. That comment is the only place the subset name appears, which is why
// the file is split on it rather than parsed properly.
const blocks = css
  .split('/*')
  .slice(1)
  .map((b) => `/*${b}`)

let out = HEADER
let kept = 0

for (const block of blocks) {
  const subset = block.match(/^\/\*\s*([a-z-]+)\s*\*\//)?.[1]
  if (!subset || !KEEP_SUBSETS.has(subset)) continue

  const url = block.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/)?.[0]
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1]
  const weight = block.match(/font-weight:\s*([^;]+)/)?.[1]?.trim()
  if (!url || !family || !weight) continue

  const name =
    `${family.replace(/\s+/g, '-').toLowerCase()}-` +
    `${weight.replace(/\s+/g, '-')}-${subset}.woff2`

  const font = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!font.ok) throw new Error(`${name}: HTTP ${font.status}`)
  writeFileSync(resolve(OUT_DIR, name), Buffer.from(await font.arrayBuffer()))

  out += block.replace(url, `/fonts/${name}`).replace(/^\/\*[^*]*\*\/\s*/, '') + '\n'
  kept += 1
}

if (kept === 0) throw new Error('No matching font faces — did the CSS format change?')

writeFileSync(OUT_CSS, out)
console.log(`${kept} font faces written to apps/web/public/fonts.`)
