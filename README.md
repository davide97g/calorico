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
- Custom foods, favourites, recent foods, copy-a-previous-day
- Weight log with trend chart and BMI
- Targets computed with Mifflin-St Jeor + activity factor, then editable
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
   fresh volume ends up with the right schema on its own.
5. Seed the food database once, from the Dokploy terminal for the api service:

   ```bash
   node dist/scripts/seed.js
   ```

`docker-compose.yml` keeps Postgres data in the named volume `calorico_pgdata` —
add it to Dokploy's backup schedule.

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
