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
