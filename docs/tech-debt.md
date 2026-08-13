# Known rough edges

Findings from a codebase-wide review, left in place on purpose: each one is
either bigger than a refactor pass or a judgement call the owner should make.
Ordered by what would bite hardest.

Everything here was verified against the code, not inferred. If you fix one,
delete the entry.

## 1. Files that have outgrown one file

| File | Lines | What is tangled |
| --- | --- | --- |
| `apps/web/src/pages/notifications.tsx` | 790 | reminder CRUD, device list, permission flow, diagnostics |
| `apps/web/src/pages/profile.tsx` | 734 | targets, metrics, account, export, deletion |
| `apps/web/src/lib/push.ts` | 702 | subscription lifecycle, iOS quirks, failure notes, diagnostics |
| `apps/api/src/routes/stats.ts` | 520 | four endpoints of inline SQL |
| `apps/web/src/pages/grocery.tsx` | 510 | list, suggestions, family switching |
| `apps/api/src/lib/history.ts` | 509 | four unrelated rankings |

None of these is broken; all of them make a targeted change harder than it should
be. Split when you next have a reason to be in one of them, not as a sweep.

## 2. `routes/stats.ts` casts raw SQL rows unchecked

Raw queries come back as `unknown` and are cast with
`rowsOf<DailyRow>(result)` — a hand-written interface with snake_case fields that
nothing verifies against the SQL above it. Rename a column in the `select` and
the types still compile; the numbers just become `undefined`.

The four suites in `routes/stats.test.ts` cover the happy paths, which is what
currently protects this. Moving the query building into `lib/stats.ts` next to
the arithmetic it feeds — and returning already-mapped camelCase rows — would
make the cast a single, reviewable place.

## 3. The web app has no tests above the helper level

62 passing tests, all pure functions: date, format, food emoji, push eligibility.
Untested: every hook, every optimistic update, every invalidation. `sumTotals`
and `groupByMeal` in `lib/nutrition.ts` exist precisely to keep an optimistic
diary consistent with the server, and nothing checks that they still do.

They are pure functions with plain inputs — the cheapest test to add in the
repo, and the one that would catch a real class of bug. Note that the response
*shapes* they consume are covered from the other side, by
`apps/api/src/routes/contract.test.ts`; what is missing is the arithmetic.

## 4. Scaling still happens inline in three places

`lib/nutrition.ts:scalePer100` is the shared path, and `food-detail` and
`photo-review` use it. Still inline:

- `components/dashboard/quick-log.tsx` and `components/food/quick-log-sheet.tsx`
  compute `(food.kcal100 * portion) / 100` directly — calories only, no macros.
- `pages/entry-detail.tsx` rescales an existing entry from its snapshot with its
  own `nextGrams / entry.quantityG` factor, which is a different operation from
  scaling a per-100 g food and deserves its own named helper.

Low risk, low reward. Worth doing the day a fourth caller appears.

## 5. Exported types with no cross-module consumer

A dozen or so `export type`/`export interface` declarations are only used inside
their own file (`ScoredFood`, `RankedScan`, `TickResult`, `PushFailure`,
`MatchedItem`, several response types in `types.ts`). They cost nothing at
runtime, but they make an unused-export scan noisy enough to hide a real dead
function. Left alone because an exported domain type is a reasonable seam to
leave open.
