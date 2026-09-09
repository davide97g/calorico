# auto-grocery

Ordering groceries on [latuaspesa.com](https://www.latuaspesa.com) (Iper Tosano)
from a shopping list. Standalone for now; it will be wired to the Calorico app
later.

## Setup

```bash
cp .env.example .env   # then fill in the account's email and password
npm i -g agent-browser && agent-browser install
```

`.env` holds live credentials and is kept out of git by the root `.gitignore`.

## Log in

```bash
./login.sh            # headless
./login.sh --headed   # show the window
```

If the login endpoint is refusing the script (403 behind reCAPTCHA, see below),
hand the last click to a human once:

```bash
./open-session.sh     # opens headed, form prefilled; click ACCEDI yourself
agent-browser --session autogrocery --restore close   # saves the cookies
```

The script leaves the browser open under the `autogrocery` session, so later
commands reuse the cookies:

```bash
agent-browser --session autogrocery snapshot -i
agent-browser --session autogrocery close
```

## What the site does that automation has to survive

- There is **no `/login` route**: the form lives in a dialog behind the account
  button, and the URL stays on the home page even after logging in. The header
  greeting (`Ciao, <name>`) is the only proof the login took.
- Two overlays cover the page on first load — the Cookiebot banner and the
  "Soluzioni per la Spesa Online" promo — and each swallows clicks until it is
  gone, not until it is dismissed.
- Vuetify keeps a dialog's scrim on top for the length of the open transition,
  so a click on the submit button lands on the scrim unless it waits for the
  button to be hit-testable.
- Right after login the site asks which service to use (Tosano Drive, Delivery
  or Locker) and which store. Nothing can go in the cart before that choice.
- `POST /ebsn/api/auth/login?token_recaptcha=...` is guarded by reCAPTCHA
  Enterprise. It never challenges anyone visibly; it just answers **403** once
  it distrusts the browser, and the UI shows only "Si è verificato un errore".
  Repeated scripted logins from the same browser get there fast, headed or
  headless alike. So log in as rarely as possible: `login.sh` runs with
  `--restore`, which keeps the cookies on disk and skips the form entirely when
  the session is still valid.

## The catalogue API

The site's own frontend talks to an eBSN JSON API at `/ebsn/api/...`, and it
answers plain `curl`. No token, no reCAPTCHA — but **prices come back `null`
without a session cookie**, so `scrape.mjs` borrows `X-Ebsn-Account` from the
browser session `login.sh` leaves behind (or takes `LATUASPESA_COOKIE`).

```bash
node scrape.mjs categories                 # id, name, slug for the 22 top categories
node scrape.mjs products 43368 1           # NDJSON, one page (200 items)
node scrape.mjs search latte               # same shape, full-text
node scrape.mjs product <slug>             # detail: ingredients, allergens, nutrition
```

Endpoints worth knowing:

| Endpoint | What it gives |
| --- | --- |
| `GET /ebsn/api/products?parent_category_id=&page=&page_size=` | listing; `page_size` honoured up to at least 500 |
| `GET /ebsn/api/products?q=` | full-text search, same shape |
| `GET /ebsn/api/products?slug=` | one product, with `metaData.product_description` |
| `GET /ebsn/api/category?filtered=true` | the 22 top-level categories |
| `GET /ebsn/api/cart/view?show_sectors=false` | the cart, for when ordering lands |

`hash=w<warehouseId>d<YYYY-MM-DD>t<timeSlot>` scopes a call to a store and a
delivery slot — the same choice the post-login dialog asks for. Omit it and the
API answers with whatever the account currently has selected.

### What the data is worth to Calorico

Measured over 800 products from four food categories: **100% carry a barcode**
(91% a 13-digit EAN), 100% a price and a brand. So every item can be matched
against Open Food Facts, which the API already imports — the barcode is the
join key, and `docs/context.md` explains where it lands.

Nutrition per 100 g comes straight from the API in
`metaData.product_description.nutritional_values`, but only for **roughly a
quarter of products** (4 of 15 in a breakfast-aisle sample), as a hand-typed
Italian HTML table with an unstable energy format (`261kJ/62kcal`,
`141 kJ - 33 kcal`). `scrape.mjs` parses it into kcal and grams; treat it as a
bonus on top of an Open Food Facts lookup, never as the primary source.
