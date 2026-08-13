# Testing

## The one thing that surprises everyone

`npm test` passes with no Postgres running — because ten of the seventeen API
suites **skip themselves**. `src/test/setup.ts` only accepts a database URL from
`TEST_DATABASE_URL`, deliberately: the route tests `truncate` every table, and
pointing them at the development database by accident would wipe a real diary.

So there are two very different green runs:

| Command | API result |
| --- | --- |
| `npm test` | 7 files, 97 tests — pure unit tests only |
| with `TEST_DATABASE_URL` | 17 files, 214 tests — every route, cascade and index |

CI always runs the second one. If you touched anything under `src/routes` or
`src/db` and only ran the first, you have not tested your change.

## Running the full suite locally

```bash
npm run db:up                                     # Postgres 17 in Docker
docker exec calorico-db-dev \
  psql -U calorico -d postgres -c 'create database calorico_test'   # once

TEST_DATABASE_URL=postgres://calorico:calorico@127.0.0.1:5432/calorico_test \
  npm test -w @calorico/api
```

The migrations are applied to that database automatically by
`src/test/global-setup.ts`, the same way the container does on boot. The suites
run with `fileParallelism: false` because they share one database.

`docker-compose.dev.yml` only publishes Postgres — the apps run on the host.

## What the suites cover

- `src/lib/*.test.ts` — the maths and the parsing: nutrition formulas, stats
  bucketing, Open Food Facts mapping, password hashing, the catalogue build.
  No database, no network.
- `src/routes/*.test.ts` — real HTTP through `app.inject()` against a real
  Postgres. They exist because cascades, generated columns, partial unique
  indexes and `pg_trgm` have no useful fake.
- `src/routes/rls.test.ts` — the row-level-security policies themselves. It is
  the only test that proves `calorico_app` cannot read another user's rows.
- `src/lib/reminders/scheduler.test.ts`, `src/lib/releases/notifier.test.ts` —
  delivery logic with an injected sender; nothing is ever pushed.
- `apps/web` — 6 files, 62 tests: pure helpers (date, format, food emoji, push
  eligibility including the iOS rules). No component rendering.

`src/test/harness.ts` is the shared setup: `startApp`, `resetDb`, `createUser`.
Use it rather than hand-rolling a fixture.

## The environment tests run in

`src/test/setup.ts` fixes it, before any module reads `env.ts`: Open Food Facts
disabled, the vision provider set to `stub` (answers from a fixture, no request
leaves the machine), a throwaway VAPID pair so the notification routes switch on,
Sentry off, the per-IP vision burst guard raised out of the way.

If a test needs a feature switched on, set the variable there — not in the test
file, which imports `env.ts` too late.

## Before you call a change done

```bash
npm run typecheck   # tsc on both apps; the web config has noUnusedLocals on
npm run lint        # oxlint on the web app
npm test            # plus TEST_DATABASE_URL if you touched routes or the schema
npm run build       # catches what only breaks in production mode
```

Those four are exactly what `.github/workflows/ci.yml` runs, and Dokploy deploys
straight from `main`.
