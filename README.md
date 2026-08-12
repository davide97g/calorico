# Calorico

[![CI](https://github.com/davide97g/calorico/actions/workflows/ci.yml/badge.svg)](https://github.com/davide97g/calorico/actions/workflows/ci.yml)
[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0-3f7530.svg)](LICENSE)
[![Data: ODbL](https://img.shields.io/badge/product%20data-ODbL-3f7530.svg)](https://opendatacommons.org/licenses/odbl/1-0/)
[![PWA](https://img.shields.io/badge/PWA-installable-3f7530.svg)](#pwa-and-updates)

A calorie and macro diary built around Italian supermarket products. React + Node
+ Postgres, packaged for a VPS running Dokploy.

**[calorico.davideghiotto.it](https://calorico.davideghiotto.it)** ·
[Privacy](https://calorico.davideghiotto.it/privacy) ·
[Terms](https://calorico.davideghiotto.it/termini) ·
[Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md)

Most calorie trackers sold in Italy are English-language databases with a
translation layer on top: search "fusilli Coop" and you get nothing, so you type
the label in by hand. Calorico starts from the products actually on Italian
shelves — supermarket private labels included — and fills the other half of the
diary, the food that never had a barcode, from composition tables.

Food data comes from two sources:

- **Open Food Facts** (ODbL) for packaged and branded products, filtered to items
  sold in Italy — including supermarket private labels (Coop, Esselunga, Conad).
- **Composition tables** (CREA / BDA-IEO) for the generic foods Open Food Facts
  cannot cover: raw chicken breast, cooked pasta, an apple. That half of a diary
  is shipped as a curated seed list.
- **Open Food Facts categories + ANSES-CIQUAL** for the rest of the unpackaged
  shelf, generated into `data/generic-catalogue.json` — see
  [The generic catalogue](#the-generic-catalogue).

## What's in it

- Daily diary with four meals, per-day totals and macro targets
- Calorie ring, macro bars, weekly bar chart, macro split donuts
- **Analisi**, its own tab in the bottom bar: day / week / month, from meal split
  and top contributors up to monthly averages, adherence and streaks — see
  [Analisi](#analisi)
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
- Push reminders at fixed times — meals, an evening check, the weekly weigh-in —
  as many as you want, each able to stay quiet when the thing is already done;
  see [Reminders](#reminders)
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
| `npm run seed -- --foods` | Foods only — no demo account, safe on a live database |
| `npm run vapid`        | Prints a VAPID key pair for the push reminders       |
| `npm run typecheck`    | Typecheck both workspaces                           |
| `npm run lint`         | oxlint on the web app                               |
| `npm test`             | Tests in both workspaces — see [Tests](#tests)      |
| `npm run import:off`   | Bulk import from the Open Food Facts dump           |
| `npm run build:catalogue` | Regenerate the generic food catalogue            |
| `npm run fonts`        | Refetch the self-hosted webfonts into `public/fonts` |

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

## The generic catalogue

Open Food Facts is an archive of packaged goods. Search it for `pesca` and it
answers with iced tea, nectar, jam and a tin of mussels — there is no record of
a peach, because nobody scans loose fruit. Anything eaten unpackaged has to come
from somewhere else.

Two sources cover it, joined on the CIQUAL food code:

| Source                              | Provides                    |
| ----------------------------------- | --------------------------- |
| OFF **categories taxonomy** (ODbL)  | the name, in Italian        |
| **ANSES-CIQUAL 2020** table         | the per-100 g composition   |

About 3 000 of the taxonomy's 14 600 categories carry a CIQUAL code, and roughly
700 of those are already named in Italian. The rest are named once, at build
time, by an LLM reading the English and French names — never at request time.
The same pass collects search synonyms for every row, named or not: the
taxonomy has no `synonyms.it` at all, so without it the salad the taxonomy calls
"Ruchetta" cannot be found by typing "rucola". The result — 2 623 foods — is
committed to `apps/api/src/data/generic-catalogue.json`, so the diff is the
review, and `npm run seed` loads it alongside the curated list.

```bash
npm run build:catalogue              # full rebuild, translations included
npm run build:catalogue -- --no-llm  # taxonomy names only, no API key needed
```

Downloads (4 MB taxonomy, 3 MB CIQUAL archive) are cached in
`apps/api/.cache/catalogue`, and so are the names themselves, written after
every batch — a run costs money and the first attempt lost 1 500 names to
timeouts with nothing to resume from. Delete the cache to rebuild from scratch.

Translation reads `CATALOGUE_LLM_API_KEY` / `_MODEL` / `_BASE_URL`, falling back
to the `VISION_*` credentials the photo feature already uses.
`CATALOGUE_LLM_EFFORT` defaults to `low` — naming a food is recall, not thought,
and at the default budget a batch spends more tokens reasoning than answering
and runs past the client timeout. Set it to `none` for a provider that rejects
the parameter.

Notes on the join:

- a category the taxonomy names in Italian wins the CIQUAL code over one that
  merely has a more precise code — `en:peaches` (named, proxy code) beats
  `en:fresh-peaches` (unnamed, exact code), and ranking it the other way round
  dropped the peach out of the catalogue entirely
- a curated food always beats a generated one of the same name: Italian tables
  over the French one, and a real serving size over a per-shelf guess
- CIQUAL leaves energy blank on about a quarter of its rows, including raw
  peach, so kcal falls back to the Atwater sum of the macros
- names are stored in one number ("Pesche") and the other forms live in
  `foods.aliases`, which is also where the English name goes

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
5. Seed the food database, from the Dokploy terminal for the api service:

   ```bash
   node dist/scripts/seed.js --foods
   ```

   Re-run it after a deploy that changed the generic catalogue: it inserts
   what is missing and backfills search aliases, and touches nothing else.

   **Use `--foods` here.** Without it the seed also creates the demo account,
   whose email and password are printed in this README — fine on a laptop,
   an open door on a public deployment.

`docker-compose.yml` keeps Postgres data in the named volume `calorico_pgdata` —
add it to Dokploy's backup schedule.

## Analisi

`/stats` is three zoom levels on the same diary, and they are deliberately not
three copies of one screen:

| Tab | Reads | What it answers |
| --- | --- | --- |
| **Giorno** | `GET /api/stats/day?day=`, `GET /api/stats/daily` | The detailed one. Meal split, macros against target, the five foods that carried the day, and the day's total against **yesterday**, against the **last 7 days** and against **that weekday's usual cost** |
| **Settimana** | `GET /api/stats/periods?unit=week`, `GET /api/stats/breakdown` | Eight weeks side by side, the selected one broken into its seven tappable days, days-in-band, macro averages, the weekday pattern and the weight it moved |
| **Mese** | `GET /api/stats/periods?unit=month`, `GET /api/stats/breakdown` | Smoothed on purpose: six monthly averages, coverage, adherence, recap and top foods. By then the question is not "which day" but "was this month better" |

Three rules run through all of it:

- **Averages are per logged day, never per calendar day.** A month with four
  untracked days is not a month of eating less, and dividing by 30 would quietly
  say it was. Coverage ("22 of 30 days") is reported as its own figure instead.
- **A running bucket stays short.** `date_trunc` decides which week or month a
  day belongs to — its week starts on Monday, which is the week these users live
  in — and the last bucket simply stops at today, drawn hollow in the bar chart
  so three days of a week never read as a light week.
- **No figure is shown alone.** Every total carries a reference: the target band,
  the previous bucket, yesterday, the weekday's own average. Where there is no
  history to compare against, the comparison is absent rather than zero.

The calendar work is SQL and the arithmetic is `lib/stats.ts`, which is why the
bucketing, the streaks and the meal shares have unit tests that need no database.

The account moved out of the bottom bar to the avatar in the top bar
(`components/layout/top-bar.tsx`), which is what freed the slot: five targets,
four of them destinations a diary is actually made of — day, analysis, shopping
list, scale — plus the log button.

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
   per-account allowance — see [Premium](#premium) — because each call costs
   money.
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

**5 €/month, charged by Stripe, and it buys exactly one thing: unlimited
meal-photo analysis.** Everything else in the app is free and stays free.

A free account gets `FREE_PHOTO_SCANS` (1) photo analysis **for the life of the
account** — one taste of the feature, not a daily allowance. Past it the API
answers `402 photo_quota_exceeded` and the client opens the paywall. The count
lives on `users.free_photo_scans_used` rather than being derived from the scan
feed: that feed is written best-effort, and a dropped row there must not hand out
a second free analysis.

The claim is one atomic statement (`claimFreePhotoScan`), taken *before* the
provider is called and handed back if the call fails or finds no food. Two photos
uploaded at the same instant therefore cost the allowance twice, not once, and an
outage on our side never eats somebody's only free scan.

### The flow

| Step | Where |
| --- | --- |
| `POST /api/premium/checkout` | creates a Stripe Checkout session, answers with its URL |
| The card | on Stripe's own page — never on ours, no card data reaches this app |
| `POST /api/premium/webhook` | Stripe calls back; **the only place premium is granted** |
| `/premium/return` | where the browser lands, polling until the webhook has landed |
| `POST /api/premium/portal` | Stripe's customer portal: card, invoices, cancellation |
| `DELETE /api/premium` | cancels at period end, without leaving the app |

Checkout cannot grant anything. The flag is written by the webhook, whose
authenticity is the signature over the raw request body — which is why that route
is its own Fastify plugin with its own buffer parser, outside the authenticated
one. `POST /api/premium/sync` reads the subscription straight from Stripe and is
what the return page uses: it makes the flow work on a laptop Stripe cannot call
back, and it removes the wait everywhere else.

`users.premium_until` holds the end of the period paid for. Someone who cancels
keeps the feature until then, and it doubles as the safety net for a
`subscription.deleted` event that never arrived: past that date the account reads
as free again even with the flag still set.

### Without Stripe keys

Unset any of `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` or `STRIPE_WEBHOOK_SECRET`
and every paying route answers `503 payments_disabled`, `/api/premium` reports
`paymentsEnabled: false` and the client disables the button. There is no
fallback that flips the flag for free — the tests assert exactly that.

### Testing it locally

```bash
stripe login                                    # sandbox account
stripe listen --forward-to localhost:3001/api/premium/webhook
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET, then restart the API
```

Card `4242 4242 4242 4242`, any future expiry, any CVC.

## Reminders

Reminders are real Web Push notifications, delivered with the app closed, and
they live on **Profilo → Promemoria**. A user can keep as many as
`MAX_REMINDERS_PER_USER` (12); the screen offers a suggested set to start from —
the four meals, an evening check of the day, and a Monday-morning weigh-in — and
every one of them is editable: time, weekdays, name, and whether it may stay
quiet.

Set the two keys plus a contact address and the feature switches on; leave any of
them unset and it switches itself off in both directions — the scheduler never
starts, and the client is told notifications are unavailable rather than letting
someone arm a reminder that could never arrive.

```bash
npm run vapid          # prints the three lines below, ready to paste
```

```env
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_SUBJECT=mailto:you@yourdomain.com
```

Both keys are checked for shape at boot, not just for presence: a truncated paste
is the one misconfiguration that looks like working software — the browser
subscribes happily, `web-push` throws on the first send, and the only symptom is a
phone that stays quiet. A wrong length fails the container at startup with the
variable named, and keys missing altogether are a `warn` on the first tick, not an
`info` nobody reads.

Rotating the pair invalidates every subscription already on a phone: browsers
hold the public key inside the subscription itself. The push service rejects those
pushes with **403**, which the sender treats as a dead subscription — so the row
is dropped, the reminders screen sees a device count of zero, and the phone
re-registers on its next visit.

### Asking for permission

`Notification.requestPermission()` has to be called **straight out of the tap**.
Safari draws the prompt only while the user gesture is still live and does not
report the difference: a request made one `await` too late resolves to `default`
with no prompt ever drawn, which is indistinguishable from a broken app. So
`subscribeToPush` asks as its first statement, and the reminders screen calls it
from the switch's own handler — never from inside a react-query `mutationFn`,
which is only reached after react-query has awaited. The mutation gets the
finished subscription handed to it.

### Diagnostics

A phone has no console, and "notifications are on but nothing arrives" has half a
dozen causes that look identical from the outside. So the reminders screen lists
every one of them with its answer — server keys, browser support, installed as an
app, permission, service worker, subscription, devices known to the server. The
first ✗ is the reason.

### How a reminder goes out

1. **One pass a minute**, started in `index.ts` rather than `app.ts` so the test
   suite never ends up with a timer sending real pushes.
2. **Postgres decides what is due.** A reminder is a wall-clock time, so the
   query compares it against `now() at time zone profiles.timezone` — the zone
   the browser reported when notifications were switched on, which is the only
   moment it can be learned. No timezone arithmetic happens in Node, and the
   process never has to agree with the database about what day it is.
3. **A reminder may skip itself.** With *skipIfLogged* on, a meal reminder looks
   for entries in that meal, the weigh-in reminder for today's weight, and the
   evening check for a day already inside its calorie band. A `custom` reminder
   always fires: nothing in the database can tell us it was handled, which is why
   the API forces the flag off for that kind.
4. **Then it is claimed, and only then sent.** The claim is a conditional write
   of today's local date into `reminders.last_sent_on`, so a restart mid-window —
   or a second API container — cannot double-notify. If nothing could be
   delivered the claim is given back and the next pass retries.
5. **Late is dropped.** `REMINDER_GRACE_MINUTES` (10) is how long after its time a
   reminder may still go out, covering a deploy or a stalled pass; past that it is
   skipped for the day, because a nudge to log lunch arriving at 17:00 is worse
   than silence.

### Devices

`push_subscriptions` holds one row per browser, keyed on the endpoint — the push
service's own name for that browser. That is what makes a re-subscribe an update
instead of a pile of dead rows, and what moves a phone that changed account. A
push service answering **404, 410 or 403** is telling us that subscription is gone
for good — the first two because the browser dropped it, the third because it was
signed with a VAPID key we no longer have — and the row is deleted on the spot.
Everything else is transient and never deletes a device.

A browser can also drop its subscription on its own, and the only symptom is
silence. So the reminders screen shows how many devices are registered, and
re-registers this one if the account wants reminders and has none.

### iOS

iOS **only delivers push to a PWA added to the home screen**, and in a plain
Safari tab it does not even define `Notification` — so the install has to be
checked *before* browser support, or the screen blames the browser for something
an install fixes. That is the order the reminders screen and `subscribeToPush`
both use: install first, then support, then permission. See [PWA and
updates](#pwa-and-updates) for the install itself.

### What is in a notification

The title, one line of body, a path to open, and a `kind` — `reminder` (the
default, and everything sent before releases existed) or `release`, which is what
tells the worker a tap means "hand the page over to the new build and reload"
rather than "open this screen". No food names, no calories, nothing from the
diary: the payload is encrypted end-to-end, but a notification also sits on a
lock screen, and a reminder needs none of that to be useful.

The `push` and `notificationclick` handlers live in `apps/web/public/push-sw.js`
and are pulled into the generated worker with `workbox.importScripts`. Keeping
them in a separate plain-JS file is what leaves the update policy in
`src/lib/pwa.ts` untouched; nginx serves that file `no-store`, like `sw.js`
itself, so a deploy can never leave stale handlers behind.

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
deletion and its cascades, and the photo allowance — including that a server with
no Stripe keys refuses the checkout rather than quietly handing out Premium.

The reminder scheduler is in there too, and it needs the database for the same
reason: "is it 13:00 for this user?" is a `now() at time zone profiles.timezone`
comparison, and a fake would only be testing the fake. Those tests set a reminder
to whatever time it currently is *in the user's zone*, so they pass at any hour in
any CI region, and they pass their own sender — nothing is ever pushed. What they
cover: the claim (a due reminder is delivered once, never twice), every skip rule,
the grace window, the weekday filter, a released claim after a failed delivery, a
dead subscription being dropped, and a zone that is not the server's.

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
- Installing is also what unlocks push: Safari delivers notifications to the
  installed app and never to a tab — see [Reminders](#reminders).

### How a deploy reaches an installed app

Getting a new build onto a phone takes two things: a server that never serves a
stale worker, and a client that keeps asking.

1. **Server** — `apps/web/nginx.conf` sends `Cache-Control: no-store` for
   `/index.html`, `/sw.js`, `/push-sw.js`, `/version.json` and
   `/manifest.webmanifest`, and
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

### When the app is closed: the release notification

Steps 1 and 2 only reach an app someone is looking at. An installed diary spends
almost all of its life closed, and a closed app cannot poll — so a deploy stayed
invisible until the user happened to open it. The push channel closes that gap:
when a new build is live, the devices still running the old one get a
notification, and tapping it loads the new version.

1. **The build names itself.** `vite.config.ts` bakes a build id into the bundle
   (`src/lib/build.ts`) and writes the same value to `dist/version.json`. nginx
   serves that file `no-store` and workbox never precaches it, so it always
   answers for the running deployment.
2. **The server reads it, not a client.** `lib/releases/notifier.ts` polls
   `WEB_ORIGIN/version.json` once a minute and inserts a row in `app_releases`
   the first time it sees a build id it has no row for. The deployed bundle is the
   only thing trusted to say what is deployed — taking a version from a client
   would let any account have every device on the server notified.
3. **Only devices that are behind are told.** Each browser reports the build it is
   running (`POST /api/notifications/version`, once per session) into
   `push_subscriptions.build_id`. The notice goes to the subscriptions whose build
   is not the deployed one — null included, since a device on the current build
   always reports it — and to nobody whose master switch is off. A "new version"
   notification landing on a phone that already updated itself is worse than
   silence: it teaches people to ignore the next one.
4. **Once, and late.** `app_releases.announced_at` is written *before* the first
   push, so a restart or a second container cannot re-announce, and the notice
   waits `RELEASE_NOTICE_DELAY_MINUTES` (10) — long enough for the apps that are
   open to update themselves and report it, dropping out of the set. Best effort
   by design: the claim is not handed back if the pushes fail, because the app
   still updates itself the next time it is opened.
5. **The tap is the interesting part.** `push-sw.js` asks the waiting worker to
   `SKIP_WAITING` — fetching it first if the browser has not noticed the deploy
   yet, since nothing polled while the app was closed — then focuses the window
   and tells the page to reload. The reload rides `controllerchange`, so it lands
   on the new build; with nothing open, `openWindow` gets it from a `no-store`
   shell. There is a 1.5 s fallback reload for the case where there was no waiting
   build to hand over to.

The first build a server ever sees is recorded as *already announced* — nobody is
knowingly behind at that point, and the alternative is one pointless notification
to every phone the first time this ships. A build id that already has a row, which
is what a rollback looks like, is not a new release and stays quiet.

Worth knowing:

- The update logic is deliberately not `virtual:pwa-register`'s: workbox-window
  classifies updates found by our own polling as "external" and never fires the
  waiting event for them, which silently swallows the prompt.
- `/api` is never cached by the worker — the diary always reads live data. Offline
  gets you the app shell, not the food database.
- If you ever put a CDN in front of Dokploy (Cloudflare and friends), exclude
  `/sw.js`, `/push-sw.js`, `/index.html`, `/version.json` and
  `/manifest.webmanifest` from its cache too.

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
| `FREE_PHOTO_SCANS` | `1`                           | Photos a free account may analyse, ever      |
| `STRIPE_SECRET_KEY` | —                            | With the price and the webhook secret, enables Premium |
| `STRIPE_PRICE_ID` | —                              | The recurring price the checkout subscribes to |
| `STRIPE_WEBHOOK_SECRET` | —                        | Signs the callback that grants premium; required together with the two above |
| `APP_URL`         | `http://localhost:5173`        | Public URL of the **web** app: where Stripe returns the browser |
| `VAPID_PUBLIC_KEY` | —                            | With the private key and a subject, enables push reminders (`npm run vapid`) |
| `VAPID_PRIVATE_KEY` | —                           | Required together with the public key         |
| `VAPID_SUBJECT`   | —                              | Contact for the push services: `mailto:` or an https URL |
| `MAX_REMINDERS_PER_USER` | `12`                    | Reminders one account may keep                |
| `REMINDER_GRACE_MINUTES` | `10`                    | How late a reminder may still be delivered    |
| `WEB_ORIGIN`      | —                              | Internal URL of the web container (`http://web`); where the API reads `/version.json` to notify devices of a new build. Unset switches release notices off |
| `RELEASE_NOTICE_DELAY_MINUTES` | `10`              | How long a new build waits before its notice goes out |
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
- `reminders.at_minutes` is minutes since local midnight, not a `time` column:
  the scheduler compares it against a minute-of-day that Postgres computes from
  `profiles.timezone`, and integer minutes is what that comparison wants on both
  sides. `reminders.last_sent_on` is a local `date` for the same reason — it is
  the once-a-day lock, and it has to mean the user's day.
- `push_subscriptions.endpoint` is the natural key, not `user_id`: it is the push
  service's own name for one browser, so a re-subscribe updates the row and a
  phone that changed account moves with it.

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

## The public site

The app is the site. There is no landing page: signed out, `/` renders the
sign-in screen, and that is what a visitor and a crawler both get.

| Path | What it is |
| --- | --- |
| `/` | The single-page app. Signed out, the sign-in screen |
| `/login`, `/stats`, `/add`, … | The same shell, one nginx location, canonical back to `/` |
| `/privacy`, `/termini` | Privacy notice and terms — static HTML, no JavaScript, no build step |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/og.png` | For crawlers, AI answer engines and link previews |
| `/api/**` | Proxied to the API container |

The two legal pages live in `apps/web/public/` as hand-written HTML with a
hand-written stylesheet (`marketing.css`). They ship no JavaScript on purpose: a
crawler, an LLM and a cold phone on 3G all get finished markup in the first
response, which no amount of prerendering the SPA would match.

The app used to sit at `/app` so the root could be a static pitch. That broke the
installed PWA — a `start_url` below the origin root is a `start_url` browsers are
free to reinterpret, and iOS opened the app in Safari instead of its own window.
The root is the app again.

Consequences worth knowing before you change routing:

- **`nginx.conf` lists the app's routes** rather than falling back on
  `try_files $uri /index.html`. A blanket fallback answers every typo with a 200
  and the shell, which a crawler reads as a page that exists. Add a route to
  `src/App.tsx` and add it to that list, or a cold load of the URL 404s while the
  same path reached by tapping through the app works.
- **`/app/**` is 301'd back to the root**, for bookmarks, push notifications and
  invite links issued while the app lived there. Keep it until the logs go quiet.
- **The manifest's `id` and `start_url` are both `/`.** The id is the installed
  app's identity: changing it would make every existing installation look like a
  different app.
- **Reminder payloads carry router paths** (`/weight`, `/add?meal=lunch`), which
  are now URLs as-is. `public/push-sw.js` still strips a leading `/app` from
  payloads queued before the move.
- **The router has no `basename`.** Anything building a URL outside the router
  spells the path out — see `inviteUrl()` in `hooks/use-family.ts`.
- **`APP_URL` on the API is the bare origin.** Stripe's `success_url` is built
  from it; the old value ended in `/app`.

### No third-party requests

The site loads nothing from another origin. That is a deliberate constraint, not
a coincidence: it is what lets the privacy notice say there are no cookies and
no consent banner, and mean it.

The webfonts used to come from Google. They now live in `public/fonts/`,
regenerated with `npm run fonts`. A stylesheet on `fonts.googleapis.com` makes
every visitor's browser hand its IP address to Google before the first pixel is
drawn, which is a transfer nobody wants to justify over a typeface.

If you add an analytics script, a font CDN, a chat widget or an embedded video,
you have also just created a disclosure obligation and, for most of them, a
consent requirement. Update the privacy notice in the same commit or do not add
it.

## Licence and attribution

The **code** in this repository is licensed under the
[GNU Affero General Public License v3.0](LICENSE). You may run, study, modify
and redistribute it under those terms. The clause that matters: if you modify
Calorico and offer it to others over a network, you have to make your modified
source available to its users. Self-hosting it unchanged, or changed for
yourself and your household, obliges you to nothing.

The name "Calorico", the logo and the brand assets are not covered by that
licence and may not be used to present a derived service as the original.

Product data and the categories taxonomy © Open Food Facts contributors,
licensed under the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
If you publish a modified copy of the database itself, ODbL's share-alike
applies to that database; your application code is unaffected.

Composition data for the generic catalogue comes from the
[ANSES-CIQUAL 2020](https://ciqual.anses.fr) table, which requires attribution;
the curated generic foods come from the Italian CREA / BDA-IEO tables. The app
credits all three on the profile screen.
