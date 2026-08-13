# Conventions

How to write code that looks like the code already here. These are descriptions
of the existing style, not aspirations — matching them keeps diffs readable and
keeps future readers from having to learn two dialects.

## Comments

The house style is unusual and worth keeping: comments explain **why**, and they
are written as prose, not as labels.

```ts
// A signature alone only proves the token was ours once. Tokens live 30 days, so
// a changed password has to be able to kill the ones already out there: one
// indexed lookup per request buys that.
```

Rules of thumb: no comment that restates the next line; a non-obvious constant
gets the reason for its value; a decision that a reader might undo gets the
argument against undoing it. A trade-off that was considered and rejected is
worth a sentence — that is the sentence nobody can reconstruct later.

## API

- **One plugin per resource** in `src/routes`, mounted with a prefix in `app.ts`.
  Auth is a plugin-wide `app.addHook('onRequest', app.authenticate)`, so a new
  route in an existing file is authenticated by default.
- **Parse at the boundary with zod**, then trust the value. Reuse the primitives
  in `src/lib/validation.ts` (`dayString`, `mealSlot`, `quantityG`, `idParam`)
  rather than re-typing a regex — two endpoints disagreeing about what a valid
  day is, is a bug the types cannot catch.
- **Errors are string codes**: `reply.code(404).send({ error: 'food_not_found' })`.
  The client maps the code to Italian copy in `lib/api.ts`; a message written on
  the server would be untranslated and unmappable. `ZodError` becomes a 400
  `validation_error` in the shared error handler; 5xx go to Sentry, 4xx do not.
- **Snake case at the boundary, camel case in the code.** Drizzle is configured
  with `casing: 'snake_case'`; raw SQL comes back snake and is mapped once, at
  the edge of the handler.
- **Imports carry `.js`** — the API is ESM with `nodenext` resolution.
- **`lib` never imports Fastify types.** That is what keeps it unit-testable.

## Web

- **A screen is a page**, default-exported from `src/pages`, lazily imported in
  `App.tsx` (except the diary and the two auth screens, which are the first
  paint).
- **All server state goes through React Query**, via a hook in
  `src/hooks/use-*.ts`. Components do not call `api()` directly.
- **Query keys come from `lib/query-keys.ts`.** Never a literal.
- **Mutations name what they invalidate.** If a mutation touches a day's totals,
  it belongs in `use-diary` behind `useInvalidateDiary`.
- **Optimistic updates must mirror the server's arithmetic** — `sumTotals` and
  `groupByMeal` in `lib/nutrition.ts` exist so an optimistic diary produces the
  totals the next fetch confirms, instead of numbers that jump.
- **Formatting lives in `lib/format.ts`**: `kcal()`, `grams()`, `pct()`,
  `signed()`, the meal labels, the Italian weekday names. Components do not call
  `Intl` or `toFixed`.
- **UI copy is Italian**; identifiers, comments and commits are English.
- `noUnusedLocals` is on, so an unused import is a failing typecheck, not a lint
  warning.

## Naming

- Grams on a value: `quantityG`, `proteinG`. Per-100 values: `kcal100`,
  `protein100`. Nothing untyped-by-name.
- A calendar day is `day`, always `YYYY-MM-DD`. A timestamp is `...At`.
- Query key modules: `queryKeys.<domain>.<thing>`, with `all` for the prefix.
- Test files sit next to what they test: `nutrition.ts` / `nutrition.test.ts`.

## Migrations

Generated, never hand-numbered: `npm run db:generate` after editing
`src/db/schema.ts`, then commit both the SQL and the snapshot under `drizzle/`.
Policies and roles that Drizzle does not model (RLS, `calorico_app`) live in
hand-written migrations — `0012_gdpr_consent_and_rls.sql` is the pattern to
follow. Migrations run on boot, so they must be idempotent and safe to re-apply.

**A hand-written migration that changes the schema needs a snapshot too.**
drizzle-kit only writes one for the migrations it generates, and every future
diff is measured against the newest snapshot — so a hand-written `ADD COLUMN`
with no snapshot makes `db:generate` emit that column again, forever. That is how
the chain drifted two migrations out of line before `0014_resync_snapshot.sql`
pulled it back; read that file before writing SQL by hand. Changes Drizzle cannot
model at all — policies, roles, grants — are safe to hand-write, because there is
nothing in `schema.ts` for a diff to disagree with.

After any migration work, check the chain is quiet:

```bash
npm run db:generate   # must print "No schema changes, nothing to migrate"
```

## Commits

Conventional prefixes (`feat:`, `fix:`, `chore:`), subject in the imperative,
lower case, written from the product's point of view — the log reads like a
changelog:

```
feat: the day picker shares the top row with the avatar
feat: the app eases itself in instead of opening on a blank screen
```

## Adding a feature end to end

The order that keeps the compiler useful:

1. `src/db/schema.ts`, then `npm run db:generate`.
2. Domain logic in `src/lib`, with a unit test beside it.
3. The route, with zod primitives from `lib/validation.ts`.
4. A route test using `src/test/harness.ts`.
5. The response type in `apps/web/src/lib/types.ts` — nothing generates it.
6. Keys in `lib/query-keys.ts`, then the hook in the matching `use-*` module.
7. The screen.
8. The full gate from [testing.md](testing.md), with `TEST_DATABASE_URL` set.
