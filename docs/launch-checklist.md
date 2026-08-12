# Launch checklist

State of play for taking Calorico public: open source, an app that can be found,
and legal pages that hold up in the EU.

Everything under **Done** is in the working tree already. Everything under
**Blocking** has to happen before the repository and the link go anywhere.

---

## Done

### Open source

- [x] `LICENSE` — GNU AGPL-3.0, full text. The repository was already public with
      no licence, which under copyright law means all rights reserved: nobody
      could legally fork it, and "open source" would have been a false claim.
- [x] `CONTRIBUTING.md` — setup, the checks CI runs, house style, what gets
      turned down.
- [x] `SECURITY.md` — private reporting, scope, response times, testing rules.
- [x] `CODE_OF_CONDUCT.md`.
- [x] Issue templates (bug, feature, wrong food data) and a PR template.
- [x] GitHub repository description, homepage and topics.
- [x] Private vulnerability reporting, Dependabot security updates,
      secret scanning and push protection all on.
- [x] Secrets audit: `.env` was never committed, no API keys anywhere in the
      history or the working tree.
- [x] README: badges, positioning paragraph, public-site section, AGPL section.

### SEO

- [x] `/` — the app itself. Signed out it renders the sign-in screen; there is no
      separate marketing page. The static landing page that used to live here was
      removed along with the `/app` mount, which broke the installed PWA.
- [x] Title, meta description, canonical, Open Graph and Twitter card tags on the
      app shell — a shared link is scraped, not rendered, so these tags are the
      whole preview.
- [x] `og.png` at 1200×630 — LinkedIn will not render an SVG, and a link
      posted without one gets a grey box.
- [x] `robots.txt` with an explicit allow for GPTBot, ClaudeBot, PerplexityBot,
      OAI-SearchBot and Google-Extended.
- [x] `sitemap.xml`.
- [x] A real `404.html`, and an nginx route list rather than a blanket SPA
      fallback, so an unknown URL is a 404 rather than a soft 200 on the shell.
- [x] Self-hosted webfonts — also removes the last render-blocking third-party
      request.

### GEO (getting quoted by AI answer engines)

- [x] `llms.txt` — what the product is, what it does, pricing, data sources,
      privacy posture and stated limits, in the form an LLM can lift verbatim.
      With the landing page gone this is the only prose description the site
      serves, so it carries the whole pitch.

The JSON-LD (`SoftwareApplication`, `FAQPage`, `WebSite`) went with the landing
page, and so did `npm run csp:hashes`. Putting it back needs either an HTML page
to hang it on or a CSP hash for an inline block in the app shell — under
`script-src 'self'` a browser drops inline `ld+json` with no visible symptom. See
the backlog below.

### Legal

- [x] `/privacy` — GDPR Arts. 13–14: controller, data inventory, Art. 9 health
      data with explicit consent as the basis, recipients, retention, rights,
      Garante complaint route.
- [x] `/termini` — service description, no-medical-advice disclaimer, data
      accuracy limits, acceptable use, AGPL and ODbL licences, Premium and the
      14-day withdrawal right, liability limits, Italian consumer forum.
- [x] Cookie question answered: **no banner is required**. There are no cookies
      at all, no analytics, no ad tech. Fonts are self-hosted. Product packshots
      load from Open Food Facts (documented in privacy §5). `localStorage` keys
      (`calorico.token`, `theme`, `calorico.pendingInvite`, `calorico.push.*`)
      are exempt under Art. 122 of the Codice privacy and the Garante's June 2021
      cookie guidelines as strictly necessary / user-set preferences. All are
      documented in §8 of the notice.
- [x] Explicit Art. 9 consent and age-16 attestation at registration, with
      timestamps and the privacy-notice version stored on the user row.
- [x] Vision-provider paragraph, forum clause, localStorage inventory, OFF image
      loads, family-leave copy, and in-app data export (Art. 20) match the
      running app. Internal RoPA and DPIA live in `docs/`.

### Routing

- [x] App at the site root. It was briefly moved to `/app` so the root could be a
      static landing page; a `start_url` below the origin root is one browsers are
      free to reinterpret, and iOS stopped opening the installed app in its own
      window. The landing page went, the root went back to being the app.
- [x] Manifest `id` and `start_url` both `/`, no router `basename`, app shortcuts,
      invite links and push-notification targets all following.
- [x] 301s from `/app/**` back to the root, for links issued during the split.
- [x] nginx serves the shell on a list of known routes, not on everything, so an
      unknown URL is still a real 404.

---

## Blocking — before the repository and the link go public

### 1. Drop the `/app` suffix from `APP_URL` in Dokploy

Stripe's `success_url` is built as `${APP_URL}/premium/return`. The value was set
to end in `/app` while the app was mounted there; now that suffix sends a paying
customer through a redirect on the way back from checkout.

```
APP_URL=https://calorico.davideghiotto.it
```

The default in `env.ts` and `.env.example` matches, and nginx 301s `/app/**` back
to the root as a backstop — but do not ship a Stripe flow that depends on a
redirect.

### 2. Verify the deploy before announcing

The routing is the risky part: installed PWAs carry whichever `start_url` their
last worker update saw, and a stale one now points at `/app`.

```bash
# after the deploy
curl -sI https://calorico.davideghiotto.it/            # 200, app shell, no-store
curl -sI https://calorico.davideghiotto.it/stats       # 200, same shell
curl -sI https://calorico.davideghiotto.it/app         # 301 -> /
curl -sI https://calorico.davideghiotto.it/app/stats   # 301 -> /stats
curl -sI https://calorico.davideghiotto.it/index.html  # 301 -> /
curl -sI https://calorico.davideghiotto.it/nonesiste   # 404
curl -s  https://calorico.davideghiotto.it/robots.txt
curl -s  https://calorico.davideghiotto.it/og.png -o /dev/null -w '%{http_code} %{size_download}\n'
```

Then by hand:

- [ ] Open the installed PWA. Confirm it opens the diary in its own window, and
      that a launch from a stale `/app` start URL still lands on the diary.
- [ ] Cold-load `/` signed out: the sign-in screen, no redirect anywhere.
- [ ] Tap a push reminder and confirm it lands on the right screen.
- [ ] Generate a family invite link and confirm it contains `/join/`, not
      `/app/join/`.
- [ ] Network tab on `/` signed out: no request leaves the origin. On a food
      with a packshot, Open Food Facts image hosts are the expected exception.

### 3. Check the link preview before posting

Paste the URL into the
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and let it
scrape once. LinkedIn caches previews hard — a bad first scrape is stuck for
days, which is exactly the wrong day for it.

There is no structured data to validate any more — see the GEO note above.

---

## Same day, right after publishing

- [ ] Google Search Console: add the property, verify, submit `sitemap.xml`,
      request indexing on `/`.
- [ ] Bing Webmaster Tools — it feeds ChatGPT search, which is half the point of
      the GEO work.
- [ ] Watch the server logs for 404s: an app route missing from the nginx list,
      or an `/app/**` link the 301 does not cover.
- [ ] Pin a repository issue as a place for first-time feedback.

## First week

- [ ] Repository social preview image (Settings → Social preview) — reuse
      `apps/web/assets/og.svg`, exported at 1280×640.
- [ ] A few screenshots in the README. It is a visual product described entirely
      in prose right now.
- [ ] A 20-second screen recording for the LinkedIn post; video outperforms a
      link preview there by a wide margin.
- [ ] Lighthouse on `/`, `/privacy` and a couple of app routes.
- [ ] Decide whether the pitch comes back as a page. Removing `/app` cost the
      site its landing page, its JSON-LD and everything an answer engine likes to
      quote except `llms.txt`. Options: a real page at `/it` or `/informazioni`
      served statically like the legal pages, or marketing copy on the sign-out
      screen itself, which crawlers see rendered but not in the first response.
- [ ] English pitch with reciprocal `hreflang`, if the LinkedIn post reaches
      beyond Italy — only once the above is decided.

## Before taking a single euro

Ordered by how badly it goes wrong if skipped.

- [ ] **Partita IVA.** Charging €5/month recurring is business income in Italy,
      not occasional income. It needs a VAT number, and for B2C digital services
      sold across the EU, OSS registration for VAT MOSS. This is the item that
      turns a hobby into an administrative obligation — talk to an accountant
      before switching Stripe on, not after.
- [ ] Update the privacy notice: add the payment provider as a recipient, add
      billing data to the inventory, add the 10-year accounting retention.
- [ ] Activate the terms' §8 and §9 (they are currently marked as not yet in
      force) and remove the "not yet active" callout.
- [ ] Pre-contractual information and an explicit "start now, I lose my
      withdrawal right pro rata" acknowledgement at checkout — Codice del
      consumo Arts. 49 and 57.
- [ ] Stripe webhook signature verification and idempotency, before real cards.

---

## Notes

- **A new app route needs a line in `apps/web/nginx.conf`.** Nothing fails in
  development, where Vite answers every path: the URL only 404s on a cold load in
  production.
- **`npm run fonts`** regenerates the self-hosted webfonts. Do not put the
  Google Fonts `<link>` back: it would add a third-party request the privacy
  notice does not cover.
- Anything that changes what data is collected, where it goes, or how long it
  is kept needs the privacy notice updated in the same commit. The PR template
  has a checkbox for it.
