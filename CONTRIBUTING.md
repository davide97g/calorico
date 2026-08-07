# Contributing to Calorico

Thanks for looking. Calorico is a personal project maintained by one person in
spare time, so the honest expectations up front:

- **Bug reports are always welcome.** They are the most useful thing you can
  send.
- **Small pull requests get reviewed.** A typo, a broken link, a wrong food in
  the generic catalogue, a fix for something that crashes.
- **Large pull requests need a conversation first.** Open an issue before
  writing a lot of code, or you risk building something that does not fit and
  getting a no after the work is done. That is a bad outcome for both of us.
- **Reviews are not fast.** A week is normal.

## Getting it running

You need Node 22+ and Docker.

```bash
npm install
npm run db:up                    # Postgres 17 with pg_trgm + unaccent
cp .env.example apps/api/.env    # then set JWT_SECRET
openssl rand -base64 48          # a value for it
npm run db:migrate
npm run seed                     # generic foods, ~hundreds of Italian products,
                                 # and demo@calorico.app / calorico123
npm run dev:api                  # http://localhost:3001
npm run dev:web                  # http://localhost:5173
```

The Vite dev server proxies `/api` to the API, so the browser only ever talks to
one origin — same as in production. The app is mounted at `/app`; the site root
is the static landing page in `apps/web/public/`.

## Before you open a pull request

Run what CI runs. It is the only gate between `main` and production, because
Dokploy deploys straight from `main`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For the database-backed suites to actually run rather than skip themselves:

```bash
TEST_DATABASE_URL=postgres://calorico:calorico@127.0.0.1:5432/calorico_test npm test
```

## House style

The code has a voice. Match it rather than your own defaults:

- **Comments explain why, never what.** If a comment restates the line below it,
  delete the comment. If a line looks wrong until you know a constraint, write
  the constraint down.
- **No dead abstractions.** One caller means one function, inline.
- **TypeScript strict, no `any`,** no `@ts-ignore` without a comment naming what
  is being ignored and why.
- **Prettier and oxlint decide formatting.** Do not argue with them in review.
- **Tests for anything with a rule in it** — a cascade, a cap, a rounding, a
  time window. Not for glue.
- **Commit messages** follow `type: what changed, in a sentence a human reads`.
  Types in use: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.

## Things worth contributing

- **Food data.** The generic catalogue (`apps/api/src/data/generic-catalogue.json`)
  is the weakest part: wrong names, missing regional foods, bad translations.
  Fixing an entry is a genuinely useful five-minute PR.
- **Accessibility.** Contrast, focus order, screen-reader labels.
- **Other countries.** Nothing in the schema is Italy-specific; the seed and the
  Open Food Facts filter are. A second country is a real feature.
- **Translations of the interface.** It is Italian-only today.

## What will get turned down

- Adding analytics, advertising, or any third-party script that phones home. The
  privacy notice says the site makes no third-party requests, and that claim is
  load-bearing.
- Dependencies that duplicate something already in the tree.
- Reformatting a file you did not otherwise change.
- Anything that makes a nutrition figure look more precise than the underlying
  data is.

## Licence

Calorico is licensed under the **GNU AGPL-3.0**. By contributing you agree that
your contribution is licensed under the same terms. There is no CLA and no
copyright assignment.

Note what AGPL means if you deploy a modified copy: run it as a network service
and you must offer your users the corresponding source. Running it unmodified,
or modified for yourself and your household, requires nothing.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Conduct

Be decent. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
