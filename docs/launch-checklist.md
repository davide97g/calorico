# Launch checklist

State of play for taking Calorico public: open source, a landing page that can
be found, and legal pages that hold up in the EU.

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

### Landing page and SEO

- [x] `/` — static landing page, zero JavaScript, no build step. Hero, features,
      data sources, pricing, open-source section, FAQ, footer.
- [x] Title, meta description, canonical, `hreflang`, Open Graph and Twitter
      card tags.
- [x] `og.png` at 1200×630 — LinkedIn will not render an SVG, and a link
      posted without one gets a grey box.
- [x] `robots.txt` with an explicit allow for GPTBot, ClaudeBot, PerplexityBot,
      OAI-SearchBot and Google-Extended.
- [x] `sitemap.xml`.
- [x] A real `404.html`, so an unknown URL is a 404 rather than a soft 200 on
      the landing page.
- [x] Self-hosted webfonts — also removes the last render-blocking third-party
      request.

### GEO (getting quoted by AI answer engines)

- [x] `llms.txt` — what the product is, what it does, pricing, data sources,
      privacy posture and stated limits, in the form an LLM can lift verbatim.
- [x] JSON-LD: `SoftwareApplication` with both offers, `FAQPage` with seven
      questions, `WebSite`.
- [x] The FAQ is written as question-shaped headings with self-contained
      answers — the unit an answer engine actually quotes.
- [x] CSP hashes for the JSON-LD (`npm run csp:hashes`). Under
      `script-src 'self'` a browser drops inline `ld+json` and the structured
      data disappears with no visible symptom.

### Legal

- [x] `/privacy` — GDPR Arts. 13–14: controller, data inventory, Art. 9 health
      data with explicit consent as the basis, recipients, retention, rights,
      Garante complaint route.
- [x] `/termini` — service description, no-medical-advice disclaimer, data
      accuracy limits, acceptable use, AGPL and ODbL licences, Premium and the
      14-day withdrawal right, liability limits, Italian consumer forum.
- [x] Cookie question answered: **no banner is required**. There are no cookies
      at all, no analytics, no ad tech, no third-party requests. The two
      `localStorage` keys (`calorico.token`, `theme`) are exempt under Art. 122
      of the Codice privacy and the Garante's June 2021 cookie guidelines as
      strictly necessary / user-set preferences. Both are documented in §8 of
      the notice.

### Routing

- [x] App moved to `/app` so the site root can be a real HTML page.
- [x] Router `basename`, manifest `start_url`, app shortcuts, invite links and
      push-notification targets all updated.
- [x] 301s from the old root-level routes for existing bookmarks.
- [x] `noindex` on the app shell.

---

## Blocking — before the repository and the link go public

### 1. Fill the three placeholders in the legal pages

Search for `[DA COMPILARE` — the pages cannot go live with them in.

- **`privacy.html` §6** — name the vision provider actually configured in
  production and its transfer basis. Both paragraphs are pre-written in an HTML
  comment right above the placeholder: keep the Mistral one (France, no transfer
  outside the EU) or the OpenAI one (US, Standard Contractual Clauses). If meal
  photo analysis is switched off in production, delete the paragraph instead.
- **`termini.html` §15** — the city for the non-consumer forum clause.
- **Decide the contact address.** The notice lists
  `privacy@calorico.davideghiotto.it` first and a personal Gmail second. Either
  create that alias, or delete the line — an address in a privacy notice that
  bounces is worse than none.

### 2. Add an explicit consent checkbox at registration

The privacy notice states that diary, weight and profile data are processed
under **explicit consent, Art. 9(2)(a) GDPR**. Explicit consent has to be an
affirmative act — a ticked box, not a line of small print. Right now the
registration form does not ask.

Minimum: an unticked, required checkbox on `/app/register` reading roughly

> Ho letto l'[informativa privacy](/privacy) e acconsento al trattamento dei
> miei dati relativi alla salute (diario alimentare, peso, dati corporei) per
> le finalità descritte.

plus a separate link to the terms. Store the timestamp of acceptance on the user
row — being able to prove *when* consent was given is the part that matters if
anyone ever asks.

This is the one item on the list where the pages currently describe something
the app does not yet do.

### 3. Set `APP_URL` to include `/app` in Dokploy

Your in-flight Stripe work builds `success_url` as `${APP_URL}/premium/return`.
With the app now mounted at `/app`, an `APP_URL` of
`https://calorico.davideghiotto.it` would drop a paying customer on a 404 the
moment they come back from checkout.

```
APP_URL=https://calorico.davideghiotto.it/app
```

The default in `env.ts` and `.env.example` was updated to match, and nginx 301s
`/premium/return` as a backstop — but do not ship a Stripe flow that depends on
a redirect.

### 4. Verify the deploy before announcing

The routing change is the risky part: existing installed PWAs have `/` as their
start URL.

```bash
# after the deploy
curl -sI https://calorico.davideghiotto.it/            # 200, marketing CSP
curl -sI https://calorico.davideghiotto.it/app         # 200
curl -sI https://calorico.davideghiotto.it/stats       # 301 -> /app/stats
curl -sI https://calorico.davideghiotto.it/nonesiste   # 404
curl -s  https://calorico.davideghiotto.it/robots.txt
curl -s  https://calorico.davideghiotto.it/og.png -o /dev/null -w '%{http_code} %{size_download}\n'
```

Then by hand:

- [ ] Sign in on a phone. Confirm the landing page bounces you to `/app`.
- [ ] Open the installed PWA. Confirm it still opens the diary, and that the
      new `start_url` takes effect after the worker updates.
- [ ] Tap a push reminder and confirm it lands on `/app/...`, not `/`.
- [ ] Generate a family invite link and confirm it contains `/app/join/`.
- [ ] Open the browser console on `/` — no CSP violations, meaning the JSON-LD
      hashes match what shipped.
- [ ] Network tab on `/`: no request leaves the origin.

### 5. Check the link preview before posting

Paste the URL into the
[LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and let it
scrape once. LinkedIn caches previews hard — a bad first scrape is stuck for
days, which is exactly the wrong day for it.

Then validate the structured data:
[Rich Results Test](https://search.google.com/test/rich-results) and
[Schema validator](https://validator.schema.org/).

---

## Same day, right after publishing

- [ ] Google Search Console: add the property, verify, submit `sitemap.xml`,
      request indexing on `/`.
- [ ] Bing Webmaster Tools — it feeds ChatGPT search, which is half the point of
      the GEO work.
- [ ] Watch the server logs for 404s on paths the 301 list missed.
- [ ] Pin a repository issue as a place for first-time feedback.

## First week

- [ ] Repository social preview image (Settings → Social preview) — reuse
      `apps/web/assets/og.svg`, exported at 1280×640.
- [ ] A few screenshots in the README. It is a visual product described entirely
      in prose right now.
- [ ] A 20-second screen recording for the LinkedIn post; video outperforms a
      link preview there by a wide margin.
- [ ] `data-export` for account portability — GDPR Art. 20 gives the right, and
      the notice promises it. Deletion works today, export does not.
- [ ] Lighthouse on `/` and `/app`. The landing page should be at or near 100.
- [ ] English version of the landing page at `/en` with reciprocal `hreflang`,
      if the LinkedIn post reaches beyond Italy.

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

- **`npm run csp:hashes` after any JSON-LD edit.** It fails loudly on invalid
  JSON, but nothing warns you if you forget to run it — the structured data just
  stops arriving.
- **`npm run fonts`** regenerates the self-hosted webfonts. Do not put the
  Google Fonts `<link>` back: it would make the privacy notice's "no third-party
  requests" claim false in one line.
- Anything that changes what data is collected, where it goes, or how long it
  is kept needs the privacy notice updated in the same commit. The PR template
  has a checkbox for it.
