# Calorico

A calorie and macro diary built around Italian supermarket products. React + Node
+ Postgres, packaged for a VPS running Dokploy.

Food data comes from two sources:

- **Open Food Facts** (ODbL) for packaged and branded products, filtered to items
  sold in Italy — including supermarket private labels (Coop, Esselunga, Conad).
- **Composition tables** (CREA / BDA-IEO) for the generic foods Open Food Facts
  cannot cover: raw chicken breast, cooked pasta, an apple. That half of a diary
  is shipped as a curated seed list.

## What's in it

- Daily diary with four meals, per-day totals and macro targets
- Calorie ring, macro bars, weekly bar chart, macro split donuts
- Product search (trigram + prefix ranking, duplicates collapsed) with an
  Open Food Facts fallback that caches into Postgres
- Barcode lookup, with native camera scanning where the browser supports it
- Meal photos: one shot becomes food + estimated quantity per item, reviewed and
  corrected before it reaches the diary — capped per account, see
  [Meal photos](#meal-photos) and [Premium](#premium)
- Custom foods, favourites, recent foods, copy-a-previous-day
- One emoji per food in every list and grouped view, guessed from the name; real
  product photos appear only on the detail pages, under **Foto** — packshot,
  ingredients and nutrition-label shots (see [Photos](#photos))
- Weight log with trend chart and BMI
- Targets computed with Mifflin-St Jeor + activity factor, then editable
- Revocable sessions, rate-limited sign-in and account deletion — see
  [Accounts and sessions](#accounts-and-sessions)
- Installable PWA (iOS included): standalone window, launch images, offline shell,
  and a deploy that reaches installed apps within a minute — see [PWA and
  updates](#pwa-and-updates)

## Stack

| Layer    | Choice                                                       |
| -------- | ------------------------------------------------------------ |
| Frontend | React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, Recharts |
| State    | TanStack Query, React Router                                  |
| Backend  | Fastify 5, Drizzle ORM, Zod                                   |
| Database | Postgres 17 (`pg_trgm` + `unaccent`)                          |
| Auth     | JWT bearer tokens, scrypt password hashing (no native deps)   |
| Deploy   | Docker Compose behind Dokploy's Traefik                      |

## Local development

```bash
# 1. Install
npm install

# 2. Start Postgres
npm run db:up

# 3. Configure the API
cp .env.example apps/api/.env
#    then edit apps/api/.env — at minimum set JWT_SECRET
#    openssl rand -base64 48

# 4. Create the schema
npm run db:migrate

# 5. Seed generic foods, a few hundred Italian products, and a demo account
npm run seed
#    demo@calorico.app / calorico123

# 6. Run both apps
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:3001`, so the browser only ever
talks to one origin — same as in production.

### Useful scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run db:generate`  | Generate a migration from schema changes            |
| `npm run db:migrate`   | Apply migrations (also creates the extensions)      |
| `npm run db:studio`    | Drizzle Studio                                      |
| `npm run seed`         | Idempotent seed; `SEED_SKIP_OFF=true` to stay local |
| `npm run typecheck`    | Typecheck both workspaces                           |
| `npm run lint`         | oxlint on the web app                               |
| `npm test`             | Tests in both workspaces — see [Tests](#tests)      |
| `npm run import:off`   | Bulk import from the Open Food Facts dump           |

## Filling the product database

The seed pulls a few hundred popular Italian products, which is enough to use the
app — anything missing is fetched from Open Food Facts on demand the first time
someone searches for it, then cached locally.

For a full offline mirror of the Italian catalogue:

```bash
# ~10 GB gzipped, ~4M products worldwide
curl -O https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
npm run import:off -- --file ./openfoodfacts-products.jsonl.gz

# or stream it without keeping the file
npm run import:off -- --url --limit 50000
```

The importer keeps only products tagged `en:italy`, normalises everything to
per-100 g values, and drops records with no usable energy value. For repeated
experiments the Parquet dump + DuckDB is faster to pre-filter with; point
`--file` at the JSONL you export from it.

## Deploying on Dokploy

1. Push this repo to GitHub and create a **Compose** application in Dokploy
   pointing at `docker-compose.yml`.
2. Set the environment variables:

   ```env
   POSTGRES_PASSWORD=<long random>
   JWT_SECRET=<openssl rand -base64 48>
   CORS_ORIGINS=https://calorico.yourdomain.com
   OFF_USER_AGENT=Calorico/1.0 (personal; contact: you@yourdomain.com)
   ```

3. Point the domain at the **web** service, container port `80`. Dokploy
   terminates TLS; nginx inside the container serves the SPA and proxies `/api`
   to the API container, so there is no second domain and no CORS to configure.
4. Deploy. The API container runs migrations on every boot before starting, so a
   fresh volume ends up with the right schema on its own. Its healthcheck hits
   `/api/ready`, which touches Postgres — see
   [Health, headers and errors](#health-headers-and-errors).
5. Seed the food database once, from the Dokploy terminal for the api service:

   ```bash
   node dist/scripts/seed.js
   ```

`docker-compose.yml` keeps Postgres data in the named volume `calorico_pgdata` —
add it to Dokploy's backup schedule.

## Photos

Lists and grouped views only ever show emoji. Real photos live on the two detail
pages, in the **Foto** panel: the Open Food Facts packshot plus its ingredients
and nutrition-label shots.

Rows live in `food_images`, and every one of them comes from Open Food Facts.
Users used to be able to attach their own photos, hosted on Cloudflare R2; that
was removed, along with the bucket, the `R2_*` variables and the `aws4fetch`
dependency. Migration `0005` deletes the rows and drops the columns that held
them. **Objects already in the bucket are not touched — empty it by hand.**

Open Food Facts publishes the label shots under separate fields, and the bulk
importer deliberately writes one row per product, so they are fetched the first
time a food's detail page is opened and the attempt is stamped in
`foods.images_synced_at` — a product without photos never re-asks.

## Meal photos

One photo of a plate becomes a list of *(food, quantity)* rows: the model names
what it sees and estimates how much of it there is, each row is matched against
the food database, and nothing is written until you have corrected it on a
review screen.

Set three variables and the **Fotografa il pasto** button appears; leave any of
them unset and the feature switches itself off — the API answers
`vision_disabled` and the UI hides the button rather than offering a dead end.

```env
VISION_PROVIDER=openai        # openai | mistral | stub
VISION_API_KEY=<your key>
VISION_MODEL=<a vision-capable model>
```

No model id is baked into the code on purpose — they get renamed and retired
faster than this file gets edited. Any vision-capable model that supports
strict JSON-schema output works; the mini tiers are plenty and keep the
per-photo cost low.

`VISION_PROVIDER=openai` also drives anything speaking the same
chat-completions dialect — Groq, OpenRouter, Together, a local Ollama — by
setting `VISION_BASE_URL` to that host.

How a photo goes:

1. **The browser compresses first**, to a 1568 px long edge and ~500 KB — more
   pixels than a gallery upload gets, because the model reads nutrition labels
   off the same image. The canvas round-trip strips EXIF, so no GPS leaves the
   phone.
2. It is posted inline to `POST /api/vision/meal` and forwarded to the provider.
   **The photo is never stored** — not on the VPS, not in a bucket, not in the
   logs. That route carries its own 1 MB body limit (the app-wide one is 512 KB),
   its own per-IP burst limit (`VISION_MAX_PER_MINUTE`, 10 by default) and a
   per-account daily allowance — see [Premium](#premium) — because each call
   costs money.
3. Every detected item is searched against the local catalogue with the same
   trigram ranking the search screen uses; packaged products additionally fall
   back to Open Food Facts. The three best candidates ride along so swapping a
   food on the review screen needs no round trip.
4. Anything with no good match keeps the model's own per-100 g estimate. On
   save it becomes a **custom food owned by you**, so it is searchable and
   re-loggable next time, and it is marked `raw.aiEstimated` to tell it apart
   from foods you typed yourself.
5. `POST /api/diary/batch` writes the whole meal in one transaction — a plate
   half-saved is worse than one you have to confirm again.

### Adding another provider

`apps/api/src/lib/vision/` splits the provider-neutral parts (the JSON schema,
the prompt, the sanity clamps, the matcher) from the adapters. A new provider is
one file exporting a `VisionProvider` plus a `case` in `index.ts` — which is
exactly what adding OpenAI alongside Mistral cost.

### Developing without a key

`VISION_PROVIDER=stub` (with any placeholder key and model) returns a canned
three-item analysis through the real parser and clamps. The whole flow —
capture sheet, review screen, batch save — works offline and costs nothing.

### On the estimates

Quantity from a single 2D photo has a real error floor; depth is unrecoverable
and dense foods (rice, oil, cheese) are the worst case. The UI leans into that
rather than hiding it: low-confidence rows say what the estimate was anchored
on, and every number is editable before save. Cooked-versus-dry weight is the
biggest systematic trap — 80 g of dry pasta is ~200 g cooked — and the prompt
addresses it explicitly.

## Premium

**There is no payment provider wired up.** `POST /api/premium/checkout` sets
`users.is_premium` and answers; the sheet in front of it is shaped like a
checkout, and says in plain Italian that nothing is being charged. It exists so
the paywall can be built and walked through before any billing decision, and so
the quota has something to switch on. Whatever eventually takes money replaces the
body of that one route — everything else already reads the flag.

What is behind it: **meal-photo analysis only**. A free account gets
`FREE_DAILY_PHOTO_SCANS` (3) photos per **rolling 24 hours**, counted off the
`scan_events` rows the analyse route already writes. Past that the API answers
`402 photo_quota_exceeded` and the client opens the paywall, holding the photo so
that "paying" analyses it straight away instead of asking for another shot.

A rolling window rather than a calendar day, on purpose: the server does not know
the user's timezone, and a window nobody has to agree on midnight for cannot be
gamed by changing it. The UI says *ultime 24 ore*.

`DELETE /api/premium` drops back to the free tier — the only way to see the
paywall twice — and is also a button on the profile page.

## Accounts and sessions

Tokens are 30-day JWTs in `localStorage`. Three things keep that from being a
one-way door:

- **`users.token_version`** rides in the token and is compared on every
  authenticated request. Bump it and every token issued so far is dead. That costs
  one indexed lookup per request, which is the price of being able to revoke at
  all.
- **`POST /api/auth/password`** bumps it, so changing the password signs out every
  device — including the one that changed it, which gets a fresh token back in the
  response.
- **`POST /api/auth/logout-all`** bumps it on demand, for a lost phone.

`POST /api/auth/login` and `/register` carry their own rate limit — 10 per 15
minutes, keyed on *route + IP + email*. The app-wide 300/min is a
denial-of-service guard; at that rate a short password is guessable. The limiter
runs at `preHandler` rather than `onRequest` because the key needs the parsed
body. Route in the key, so registering does not eat the login allowance; email in
the key, so one address cannot lock a household out and one attacker cannot
spread guesses across accounts.

`DELETE /api/profile` deletes the account. It asks for the password again (a
stolen token must not be able to do this) and for the word `ELIMINA` in the
dialog. Most of the work is `on delete cascade`; three things are done by hand —
custom foods the user authored, families left with no members, and nothing else:
Open Food Facts and generic foods are not the user's data, and other people's
diary entries keep working because they carry a name snapshot.

## Health, headers and errors

- **`/api/health`** is liveness — the process is up. **`/api/ready`** runs
  `select 1`, and it is the one Docker and Dokploy watch: a container that cannot
  reach Postgres has to fail its check instead of staying green and erroring on
  every request.
- **Security headers.** `@fastify/helmet` covers the API. The SPA's own headers —
  CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS —
  live in `apps/web/security-headers.conf`, which every `location` block in
  `nginx.conf` includes. The include is not tidiness: nginx does not merge
  `add_header` across levels, so a location that sets one of its own drops
  everything inherited, and every location here sets `Cache-Control`.
- **Sentry** is optional on both sides and off by default. `SENTRY_DSN` for the
  API, initialised in `instrument.ts` before anything else so its instrumentation
  can patch what it needs; 5xx only, since 4xx are the client's problem.
  `VITE_SENTRY_DSN` for the browser, imported dynamically — with no DSN the build
  drops the SDK entirely, so nobody downloads 28 KB gzipped of error tracking that
  is switched off.

## Tests

```bash
npm test                 # both workspaces
npm test -w @calorico/api
```

Pure logic — Mifflin-St Jeor and the macro split, scrypt hashing, the Open Food
Facts parsers, date handling, the emoji guesser — runs anywhere.

The route tests need a real Postgres, because what they check is cascades,
generated columns, partial unique indexes and `pg_trgm`, none of which a fake
has. They skip themselves unless `TEST_DATABASE_URL` is set, and they only ever
read that variable — never `DATABASE_URL` — because they truncate every table and
pointing them at the development database would wipe a real diary.

```bash
docker exec calorico-db-dev psql -U calorico -d postgres -c 'create database calorico_test'
TEST_DATABASE_URL=postgres://calorico:calorico@127.0.0.1:5432/calorico_test npm test -w @calorico/api
```

What they cover: family sharing in both directions (two households cannot see
each other; a stranger cannot read, rotate or leave someone else's family; a
member who left stops receiving), token revocation, the login rate limit, account
deletion and its cascades, and the photo quota including the fake checkout.

`.github/workflows/ci.yml` runs typecheck, lint, tests and a production build on
every push and pull request, with Postgres as a service container. Since Dokploy
deploys from `main`, that workflow is the only gate in front of production.

## PWA and updates

The web app installs as a standalone app. Assets live in `apps/web/public/icons`
(app icons, maskable variants, `apple-touch-icon`) and `apps/web/public/splash`
(iOS launch images); the manifest is generated from the `VitePWA` block in
`apps/web/vite.config.ts`.

### iOS

- Install from Safari with **Share → Add to Home Screen**. iOS ignores the
  install prompt and the manifest icons, so the 180×180 `apple-touch-icon` and
  the `apple-mobile-web-app-*` meta tags in `index.html` are what it actually
  reads.
- The 13 `apple-touch-startup-image` links cover current iPhones and iPads in
  portrait. A device without a match just launches on the background colour.
- The status bar follows `theme-color` (light and dark variants), and the layout
  already pads with `env(safe-area-inset-*)`.

### How a deploy reaches an installed app

Getting a new build onto a phone takes two things: a server that never serves a
stale worker, and a client that keeps asking.

1. **Server** — `apps/web/nginx.conf` sends `Cache-Control: no-store` for
   `/index.html`, `/sw.js` and `/manifest.webmanifest`, and
   `max-age=31536000, immutable` only for content-hashed files under `/assets/`
   and `workbox-*.js`. A cached `sw.js` is the one failure mode that makes a
   deploy invisible, so nothing is allowed to hold on to it.
2. **Client** — `apps/web/src/lib/pwa.ts` registers the worker and calls
   `registration.update()` on load, every 60 s while the app is open, when the
   app is brought back to the foreground, and when the network comes back. When a
   new worker finishes installing it is applied immediately if the app is in the
   background, otherwise a toast offers *Aggiorna*; either way the page reloads
   through `controllerchange`, and the pending update is also applied on the next
   foreground/background switch. So an installed app picks up a deploy within
   about a minute of being used, without a force-quit.

Worth knowing:

- The update logic is deliberately not `virtual:pwa-register`'s: workbox-window
  classifies updates found by our own polling as "external" and never fires the
  waiting event for them, which silently swallows the prompt.
- `/api` is never cached by the worker — the diary always reads live data. Offline
  gets you the app shell, not the food database.
- If you ever put a CDN in front of Dokploy (Cloudflare and friends), exclude
  `/sw.js`, `/index.html` and `/manifest.webmanifest` from its cache too.

### Environment variables

| Variable          | Default                        | Notes                                        |
| ----------------- | ------------------------------ | -------------------------------------------- |
| `DATABASE_URL`    | —                              | Required                                     |
| `JWT_SECRET`      | —                              | Required, ≥ 24 chars                         |
| `PORT`            | `3001`                         |                                              |
| `CORS_ORIGINS`    | `http://localhost:5173`        | Comma separated; unused in the nginx setup   |
| `OFF_USER_AGENT`  | `Calorico/0.1 …`               | Open Food Facts asks for a contact address   |
| `OFF_ENABLED`     | `true`                         | `false` runs entirely off the local mirror   |
| `VISION_PROVIDER` | —                              | `openai`, `mistral` or `stub`; with key + model, enables meal photos |
| `VISION_API_KEY`  | —                              | Required together with provider and model    |
| `VISION_MODEL`    | —                              | No default: model ids change too often       |
| `VISION_BASE_URL` | —                              | `openai` only: any compatible host (Groq, OpenRouter, Ollama) |
| `VISION_MAX_IMAGE_BYTES` | `1048576`               | Backstop for a client that skipped compression |
| `VISION_TIMEOUT_MS` | `30000`                      | Vision calls are slow                        |
| `VISION_MAX_PER_MINUTE` | `10`                     | Per-IP burst limit on the analyse route      |
| `FREE_DAILY_PHOTO_SCANS` | `3`                     | Photos a free account may analyse per rolling 24 h |
| `SENTRY_DSN`      | —                              | Unset: the SDK is never initialised          |
| `SENTRY_ENVIRONMENT` | `NODE_ENV`                  | Tag on every event                           |
| `SENTRY_TRACES_SAMPLE_RATE` | `0`                  | `0` sends errors only                        |
| `VITE_SENTRY_DSN` | —                              | Browser DSN, baked in at build time (public by design); unset drops the SDK from the bundle |
| `TEST_DATABASE_URL` | —                            | Only read by the test run; unset skips the database suites |
| `OFF_BASE_URL`    | `https://world.openfoodfacts.org` | Barcode lookups                           |
| `OFF_SEARCH_URL`  | `https://search.openfoodfacts.org` | Text search (the v2 search endpoint is mostly 503) |

## Data model notes

- Nutriments are always stored **per 100 g/ml**; portions are scaled at write
  time.
- Diary entries keep a **snapshot** of name, brand and macros. A crowdsourced
  product being edited or deleted upstream must never rewrite last month's diary.
- `foods.barcode` has a **partial unique index** (`where barcode is not null`),
  since generic foods have none. Any `ON CONFLICT` on it has to repeat that
  predicate.
- Diary days are plain `date` columns and always derived from **local** time. Using
  `toISOString()` would file "today" under yesterday for anyone east of Greenwich
  after midnight UTC.

## Data quality

Open Food Facts is crowdsourced, and it shows: missing nutriments, kJ-only
records, serving sizes written as free text, the same product under a dozen
barcodes with the brand spelled differently each time. The import layer
compensates:

- energy is derived from kJ, or from the macros, when kcal is absent
- records with no usable energy, or above 950 kcal/100 g, are rejected
- drinks are detected from canonical category tags (not substring matching —
  almost everything in Open Food Facts sits under
  `en:plant-based-foods-and-beverages`)
- search collapses duplicates on name + energy, preferring the copy that has a
  brand, a photo and a serving size

## Licence and attribution

Product data © Open Food Facts contributors, licensed under the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
The app credits it on the profile screen. If you publish a modified copy of the
database itself, ODbL's share-alike applies to that database; your application
code is unaffected.
