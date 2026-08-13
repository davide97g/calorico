# CLAUDE.md

Calorico — calorie and macro tracker, Italian UI, npm workspace monorepo:
`apps/api` (Fastify 5 + Drizzle + Postgres 17) and `apps/web` (React 19 + Vite +
React Query, PWA). Read [docs/context.md](docs/context.md) before your first
change; it is the code map and the list of invariants.

| Doc | Read it when |
| --- | --- |
| [docs/context.md](docs/context.md) | orienting: layout, request lifecycle, RLS, invariants |
| [docs/conventions.md](docs/conventions.md) | writing code: patterns, naming, comment style, the end-to-end feature checklist |
| [docs/testing.md](docs/testing.md) | verifying: why a green `npm test` can be a lie |
| [docs/tech-debt.md](docs/tech-debt.md) | before a refactor, or when something looks wrong on purpose |
| [README.md](README.md) | what the product does and how it is operated |

## Verify like CI does

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` **skips the ten database-backed API suites** unless
`TEST_DATABASE_URL` is set: 97 tests instead of 214. If you touched
`apps/api/src/routes` or `apps/api/src/db`, run them for real —
[docs/testing.md](docs/testing.md) has the two-line Docker recipe.

CI is the only gate between a push to `main` and production: Dokploy deploys
straight from `main`.

## Rules that are easy to break silently

- **`apps/web/src/lib/types.ts` is a hand-written mirror of the API's responses.**
  Nothing generates or checks it. Change a payload, change that file.
- **Query keys come from `apps/web/src/lib/query-keys.ts`, never inline.**
  Invalidation is prefix-based, so a literal in the wrong shape leaves a screen
  stale without failing anything.
- **Request primitives come from `apps/api/src/lib/validation.ts`** —
  `dayString`, `mealSlot`, `quantityG`, `idParam`. Don't retype the regex.
- **`db` is a request-scoped proxy** with row-level security applied; `adminDb`
  bypasses it and is only correct for login, the Stripe webhook, the schedulers,
  migrations and seeds.
- **A day is a local `YYYY-MM-DD`** from `lib/date.ts:toISODay`, never
  `toISOString()`.
- **kcal are whole, macros carry one decimal** (`roundKcal` / `roundMacro`). Sum
  first, round once.
- **Missing configuration means "feature off", not "crash".** A clone with only
  `DATABASE_URL` and `JWT_SECRET` must boot and work.
- **`npm run db:generate` currently emits a bogus migration** — see
  [docs/tech-debt.md](docs/tech-debt.md) item 1 before you trust it.

## Conventions in one line each

Italian UI copy, English code and commits. Comments explain *why*, in prose.
Conventional commit subjects in the imperative, product's point of view. API
imports carry `.js`. `apps/api/src/lib` never imports Fastify types. Components
never call `api()` directly — always a `use-*` hook.
