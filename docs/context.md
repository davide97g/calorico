# Context

Orientation for anyone — human or agent — changing this codebase. The
[README](../README.md) explains what the product does and how to operate it;
this file explains where the code lives, what holds it together, and which rules
you cannot break without causing a bug that testing will not catch.

Companion docs: [conventions.md](conventions.md) (how to write code that matches
the codebase), [testing.md](testing.md) (how to verify a change),
[tech-debt.md](tech-debt.md) (known rough edges, deliberately left).

## Shape

An npm workspace monorepo, two apps, no shared package:

```
apps/api    Fastify 5 + Drizzle + Postgres 17. ESM, .js import specifiers.
apps/web    React 19 + Vite + React Query + Tailwind 4 + shadcn-style UI. PWA.
docs/       This. Plus the GDPR paperwork (dpia, ropa) and a launch checklist.
scripts/    Build-time helpers (font fetch, precache verification).
```

The two apps talk over `/api` only. There is no generated client and no shared
types package: `apps/web/src/lib/types.ts` is a **hand-written mirror** of what
the routes return. Changing a response shape means changing that file too — the
compiler will not tell you.

## apps/api

```
src/app.ts            Fastify assembly: plugins, hooks, error handler, route mounting.
src/index.ts          Boot. Imports instrument.ts first, then starts the schedulers.
src/env.ts            Every environment variable, parsed and validated once.
src/db/schema.ts      Drizzle schema. The single source of truth for the data model.
src/db/index.ts       Connection pools and the per-request RLS machinery.
src/routes/*.ts       One Fastify plugin per resource, mounted under /api/<name>.
src/lib/*             Domain logic, deliberately free of Fastify types.
src/lib/validation.ts The zod primitives shared across routes (day, meal, quantity, id).
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
  schedulers, migrations, seeds and the token-version lookup — and wrong
  everywhere else.
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
- **Shared rows** — grocery list, scan feed: `lib/family.ts`. Reads merge across
  every family the user belongs to; a write needs one target, resolved by
  `resolveWriteFamilyId`.

### Things that are off by default

`env.ts` treats missing configuration as "feature absent", not "error": no
`SENTRY_DSN` means no Sentry, no `VISION_*` means the photo flow answers 503 and
the UI hides the button, no Stripe keys means the paywall stays hidden, no VAPID
pair means reminders are unavailable. Keep that property — a fresh clone with
only `DATABASE_URL` and `JWT_SECRET` has to boot and work.

## apps/web

```
src/App.tsx           Routes. Everything past the diary is a lazy chunk.
src/main.tsx          Providers, React Query client, Sentry, PWA registration.
src/pages/*           One screen per file, default-exported.
src/components/*      ui/ = shadcn primitives · dashboard, food, stats, charts, layout = app parts.
src/hooks/use-*.ts    One React Query hook module per domain. See below.
src/lib/query-keys.ts Every query key in the app. Read this before writing a mutation.
src/lib/types.ts      The hand-written mirror of the API's responses.
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
