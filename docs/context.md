# Context

Orientation for anyone — human or agent — changing this codebase. The
[README](../README.md) explains what the product does and how to operate it;
this file explains where the code lives, what holds it together, and which rules
you cannot break without causing a bug that testing will not catch.

Companion docs: [conventions.md](conventions.md) (how to write code that matches
the codebase), [testing.md](testing.md) (how to verify a change),
[tech-debt.md](tech-debt.md) (known rough edges, deliberately left).

## Shape

An npm workspace monorepo — two apps and the contract between them:

```
apps/api            Fastify 5 + Drizzle + Postgres 17. ESM, .js import specifiers.
apps/web            React 19 + Vite + React Query + Tailwind 4 + shadcn-style UI. PWA.
packages/contracts  The zod schemas both apps agree on. Compiled; see below.
docs/               This. Plus the GDPR paperwork (dpia, ropa) and a launch checklist.
scripts/            Build-time helpers (font fetch, precache verification).
```

The two apps talk over `/api` only, and `@calorico/contracts` is what keeps them
honest about it: the API parses requests with its schemas, the web app infers
`lib/types.ts` from them, and `apps/api/src/routes/contract.test.ts` parses real
responses through them so a changed payload fails a test rather than a screen.
Add a field to the contract, not to `types.ts`.

Because the API resolves the package through its built declarations, the contract
is compiled before anything else can typecheck. The root scripts do that for you
(`pretypecheck`, `pretest`, `prebuild`, `predev` all run `npm run contracts`), and
both Dockerfiles build it before the app that needs it. Running a workspace script
directly — `npm run build -w @calorico/web` — skips the hook, so build the
contract first or use the root script.

## apps/api

```
src/app.ts            Fastify assembly: plugins, hooks, error handler, route mounting.
src/index.ts          Boot. Imports instrument.ts first, then starts the schedulers.
src/env.ts            Every environment variable, parsed and validated once.
src/db/schema.ts      Drizzle schema. The single source of truth for the data model.
src/db/index.ts       Connection pools and the per-request RLS machinery.
src/routes/*.ts       One Fastify plugin per resource, mounted under /api/<name>.
src/lib/*             Domain logic, deliberately free of Fastify types.
src/test/contract.ts  expectContract, used by routes/contract.test.ts.
src/scripts/*         One-shot jobs: seed, Open Food Facts import, catalogue build, VAPID keys.
drizzle/*.sql         Migrations, applied on boot and by `npm run db:migrate`.
```

Route files stay thin: parse with zod, query, shape the response. Anything with
rules in it — ranking, nutrition maths, sharing, quotas, push delivery — lives in
`src/lib` so it can be unit-tested without a request.

### Request lifecycle

1. `onRequest` puts a fresh `RlsStore` in an `AsyncLocalStorage` (`db/index.ts`).
2. Authenticated routes run `app.authenticate`: verify the JWT, then check
   `users.token_version` against the token's `ver` — that is what makes
   "sign out everywhere" and a password change kill live tokens.
3. `enterRls(userId)` reserves a connection, `SET ROLE calorico_app`, and sets
   `app.user_id`. From then on the exported `db` proxy resolves to that
   connection, so row-level security applies to every query in the handler.
4. `onResponse` runs `finishRls`: rollback if the request errored, `RESET ROLE`,
   release the connection.

**Consequences you must respect:**

- `db` is a proxy. Import it and use it; never capture it in a module-level
  variable and never pass it across a request boundary.
- `adminDb` bypasses RLS. It is correct for login, the Stripe webhook, the
  schedulers, migrations, seeds, the token-version lookup and the signed grocery
  photo route — and wrong everywhere else. The last two entries are the same
  case: a request proving itself with a signature instead of a session, reading
  exactly the one row that signature names.
- RLS is a second line of defence, not the first. Handlers still write their own
  `eq(table.userId, request.user.sub)`; `src/routes/rls.test.ts` guards the
  policies themselves.

### Ownership and sharing

Three different rules, each centralised, none of them to be re-derived inline:

- **Rows with one owner** — diary entries, weight logs, reminders: a hand-written
  `eq(table.userId, ...)` in the handler.
- **Foods** — `lib/food-visibility.ts`. Catalogue rows (`off`, `generic`) are
  everyone's; `custom` belongs to `createdBy`. Search, barcode lookup and the
  detail route all have to spell this the same way or a homemade recipe leaks.
- **Shared rows** — grocery list, pantry, scan feed: `lib/family.ts`. Reads merge
  across every family the user belongs to; a write needs one target, resolved by
  `resolveWriteFamilyId`. All three carry a generated `listId`
  (`coalesce(family_id, user_id)`) so "the household's rows" is one column.

### Where a food comes from

`foods.source` records it, and the lookup order is fixed:

1. the local table, which is also the cache for everything below;
2. **Open Food Facts** (`lib/off.ts`) — `off`, the packaged half of the
   catalogue, plus `generic` rows built from composition tables by
   `scripts/build-generic-catalogue.ts`;
3. **Tosano** (`lib/tosano.ts`) — `tosano`, the supermarket's own label table,
   reached only when OFF answers nothing. Its listing carries no nutrition, so
   a hit costs a second call on the product's slug, and roughly three products
   in four have no table there either. Those fall back to an OFF lookup on the
   barcode Tosano supplied, and the row they produce says `off`: the source is
   wherever the numbers came from, not whoever found the product.

The web app prints the Tosano mark next to a `tosano` row
(`components/food/tosano-mark.tsx`), and its own mark next to a `recipe` one.

### A recipe is a food

`recipes` + `recipe_ingredients` hold the composition; the nutrition is a
`foods` row with `source: 'recipe'`, recomputed by `lib/recipe.ts` on every
save. That is the whole design, and it is what lets search find a dish, the
diary log it by the gram, the portion chips offer "one portion" and the stats
count it — none of them knowing that recipes exist.

Four things follow from it:

- **The numbers are a snapshot.** An ingredient corrected in the catalogue does
  not move a dish somebody has been logging for a month; saving the recipe again
  re-measures it. That is also why a recipe may be an ingredient of another one
  without any risk of a loop.
- **`yield_g` is asked for, not summed.** Cooking changes weight, and the
  per-100 g figures are wrong by exactly that much if the raw total is assumed.
  It defaults to the sum of the ingredients, which is right for anything
  uncooked, and the food carries it as `packageSizeG` so the food screen's
  "28% of the pack" line reads "28% of the recipe" with no new UI.
- **A portion is the food's `servingSizeG`** (`yield_g / servings`), so logging
  one is the chip that was already there.
- **A recipe is private, like a custom food.** `lib/food-visibility.ts` lists
  both sources, and the `foods_visibility` RLS policy draws the same line on
  `created_by`. Deleting a recipe deletes its food; diary entries keep their
  snapshots.

### How the shopping list writes itself

`lib/pantry.ts` is the loop, and it is the only place in the API where writing
one row causes another to appear:

1. A product is stocked on purpose — `POST /api/pantry`, packages and a package
   size. Nothing here is ever created implicitly.
2. Every diary write moves the stock by a delta, inside the same transaction as
   the entry: create, batch, patch (the difference), delete and copy all call
   `applyPantryDelta`. A negative delta hands grams back, so correcting a
   mistyped 300 g does not drain the cupboard for good.
3. Crossing `PANTRY_LOW_FRACTION` of one package writes a `source: 'auto'` row
   onto the shopping list and stamps `lowNotifiedAt`. The stamp is what makes it
   fire once per package cycle: a user who deletes the automatic row has said
   no, and the next spoonful must not put it back.
4. Ticking that row off the list restocks the cupboard and clears the stamp,
   which re-arms the whole thing.

Consuming a food with no pantry row does nothing at all. That is deliberate:
scanning a barcode used to add the product to the shopping list, and the list
filled with everything anyone had ever picked up — a cupboard that stocked
itself from the diary would repeat that with more steps.

### Things that are off by default

`env.ts` treats missing configuration as "feature absent", not "error": no
`SENTRY_DSN` means no Sentry, no `VISION_*` means the photo flow answers 503 and
the UI hides the button, no Stripe keys means the paywall stays hidden, no VAPID
pair means reminders are unavailable, no `S3_*` means the grocery photo button
never appears, `TOSANO_ENABLED` unset means searches and
barcodes stop at Open Food Facts. Keep that property — a fresh clone with
only `DATABASE_URL` and `JWT_SECRET` has to boot and work.

## packages/contracts

```
src/primitives.ts     The shared enums, a day, a portion, a uuid param, a person ref.
src/food.ts           Foods, their images, portion history, and newFoodInput.
src/diary.ts          Entries, totals, targets, the day payload, batch input.
src/stats.ts          Everything the Analisi tab reads.
src/weight.ts src/meals.ts src/social.ts src/notifications.ts
src/pantry.ts         The cupboard: a stocked product, and what it takes to change it.
src/account.ts        Session, profile, bodyMetrics, targets, premium.
src/vision.ts         Photo analysis and its quota.
```

Two kinds of schema live here, and the difference decides how strict they are:

- **Request** schemas — `newFoodInput`, `bodyMetrics`, `batchEntryInput` and the
  primitives — *are* the validation. They carry `min`, `max`, `regex` and
  defaults, and the API parses with them at the boundary.
- **Response** schemas describe what a handler sends: precise about fields and
  types, deliberately loose about constraints, and tolerant of unknown keys
  because handlers legitimately send more than a screen reads.

Timestamps are strings here. `Date` belongs to Drizzle, not to the wire.

## apps/web

```
src/App.tsx           Routes. Everything past the diary is a lazy chunk.
src/main.tsx          Providers, React Query client, Sentry, PWA registration.
src/pages/*           One screen per file, default-exported.
src/components/*      ui/ = shadcn primitives · dashboard, food, stats, charts, layout = app parts.
src/hooks/use-*.ts    One React Query hook module per domain. See below.
src/lib/query-keys.ts Every query key in the app. Read this before writing a mutation.
src/lib/types.ts      Re-exports the contract's types. Not a place to add a field.
src/lib/*             Pure helpers: date, format, nutrition, portion, push, pwa, zoom.
```

### The hook modules

Data access is grouped by domain, and the grouping is the API surface:

| Module | Owns |
| --- | --- |
| `use-diary` | one day's entries and every write that changes a day's totals |
| `use-stats` | the Analisi reads (daily, day, periods, breakdown) |
| `use-weight` | the weight feed and the daily weigh-in |
| `use-foods` | catalogue search, one food, recents, favourites, images, create |
| `use-vision` | photo-analysis status and the analysis call |
| `use-profile` | profile patch, target suggestions, onboarding |
| `use-meals` | saved plates |
| `use-recipes` | the cookbook; every write also rewrites a food, so all of them invalidate the catalogue |
| `use-pantry` | the cupboard; every mutation can write a shopping row, so all of them invalidate the list too |
| `use-grocery`, `use-family`, `use-scans`, `use-notifications`, `use-premium` | one feature each |
| `use-auth` | session, the `me` query, login/logout |

A mutation that changes a day's totals belongs in `use-diary`, where
`useInvalidateDiary` is the single answer to "what else has to refetch?".

### Cache invalidation is prefix-based

`queryKeys` in `lib/query-keys.ts` is the whole registry, and the nesting is
load-bearing: invalidating `queryKeys.stats.all` reaches every stats query,
`queryKeys.foods.detail(id)` also reaches that food's images, and grocery
suggestions sit under the grocery key so any list mutation refreshes them. Never
type a key literal inline — a stale screen after a mutation is close to
invisible in review and obvious to a user.

## Invariants

- **A day is a local calendar date, `YYYY-MM-DD`.** Derive it with
  `lib/date.ts:toISODay`, never `toISOString()`, which moves "today" to
  yesterday east of Greenwich after midnight UTC.
- **Weeks start on Monday.** Postgres `date_trunc('week')` and the helpers in
  `lib/date.ts` have to agree, or a range and its buckets drift by a day.
- **Nutrients are stored per 100 g and scaled at write time.** The server's
  `scaleNutriments` and the client's `scalePer100` round identically on purpose.
- **kcal are whole numbers, macros carry one decimal.** `roundKcal` /
  `roundMacro` in `apps/api/src/lib/nutrition.ts`. Sum first, round once.
- **A diary entry keeps a snapshot.** `nameSnapshot`, `brandSnapshot` and the
  scaled macros are written on the row, so deleting a food never rewrites
  history.
- **Stock is one number, stored as two.** `sealedPackages` and `remainingG` are
  a total split so that an open package can be told from an untouched one;
  `lib/pantry.ts` works on the total and normalises back, and 400 g of a 400 g
  jar is one jar open, not one jar sealed.
- **Averages are per logged day, never per calendar day** (`lib/stats.ts`), and
  an empty day is still a row: coverage is a statistic of its own.
- **The UI copy is Italian.** Code, comments, commits and docs are English.

## Working on it

```bash
npm run db:up            # Postgres 17 in Docker
npm run db:migrate
npm run seed             # generic foods, some Italian products, demo@calorico.app / calorico123
npm run dev              # both apps
```

Before calling anything done, run the CI gate — the same four commands GitHub
runs, and the only thing between a push to `main` and production:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` skips every database-backed suite unless `TEST_DATABASE_URL` is set,
which means a green run locally can hide a broken route. See
[testing.md](testing.md) for the recipe that actually exercises them.
