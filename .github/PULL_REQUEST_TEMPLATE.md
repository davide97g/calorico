<!--
Dokploy deploys straight from main, so a merged pull request is a production
deploy. CI is the only gate. Please make sure it is green before asking for a
review.
-->

## What this changes

<!-- One or two sentences. What is different for someone using the app? -->

## Why

<!-- The problem behind the change. Link the issue if there is one. -->

Closes #

## Checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass
- [ ] Tests added for anything with a rule in it — a cascade, a cap, a rounding, a time window
- [ ] Comments explain *why*, not *what*
- [ ] No new third-party request from the browser (the privacy notice promises there are none)
- [ ] `npm run csp:hashes` re-run, if any JSON-LD on the landing page changed
- [ ] Privacy notice and terms updated, if this changes what data is collected, where it goes, or how long it is kept

## Anything a reviewer should look at twice

<!-- A tradeoff you are unsure about, a migration that touches live data, a
     place you could not test. Say so here rather than hoping it goes unnoticed. -->
