#!/usr/bin/env bash
# Logs the household account into latuaspesa.com (Tosano) and leaves the browser
# session open for whatever comes next. The session is named, so a later run
# reuses the cookies instead of logging in again.
#
#   ./login.sh            # headless
#   ./login.sh --headed   # show the window
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$here/.env"; set +a

session=autogrocery
# --restore keeps cookies on disk between runs, so a closed browser comes back
# already logged in. That matters beyond convenience: the login endpoint is
# behind reCAPTCHA Enterprise, and it starts answering 403 when the same account
# logs in over and over from a scripted browser.
ab() { agent-browser --session "$session" --restore "$@"; }

ab open ${1:-} "$LATUASPESA_BASE_URL"

# A daemon left over from an earlier run can relaunch the browser on the next
# command and hand back a fresh, blank page; navigating again lands it for real.
if [ "$(ab get url | tr -d '[:space:]')" = "about:blank" ]; then
  ab navigate "$LATUASPESA_BASE_URL"
fi

# A session kept from an earlier run is already logged in; the login dialog is
# not reachable then, so stop here.
if ab eval "document.body.innerText.includes('Ciao')" | grep -q true; then
  echo "✓ session already logged in as $LATUASPESA_EMAIL"
  exit 0
fi

# Cookiebot's banner and the "prima spesa online" promo each arrive on their own
# overlay a beat after the page, and both swallow every click until dismissed.
if ab wait '#CybotCookiebotDialogBodyButtonDecline' >/dev/null 2>&1; then
  ab click '#CybotCookiebotDialogBodyButtonDecline'
  # The banner fades out; clicking anything under it while it fades lands on the
  # banner instead, so wait for it to be really gone.
  ab wait --fn "(() => { const d = document.getElementById('CybotCookiebotDialog'); return !d || getComputedStyle(d).display === 'none' })()"
fi
# The promo dialog ("Soluzioni per la Spesa Online") comes up on its own overlay
# once mounted. Escape closes it when the window has focus, which a headless one
# never does, so click its close button instead.
if ab wait --text "Soluzioni per la Spesa Online" >/dev/null 2>&1; then
  ab eval "document.querySelector('.vuedl-layout__closeBtn')?.click(); true" >/dev/null
fi
# A closed overlay leaves its scrim node behind, inert; only a scrim that still
# takes pointer events is in the way.
ab wait --fn "Array.from(document.querySelectorAll('.v-overlay__scrim')).every(s => getComputedStyle(s).pointerEvents === 'none' || s.getBoundingClientRect().height === 0)" >/dev/null

# The account button opens the login dialog; the site has no /login route.
ab find role button click --name "Menù account"
ab wait --text "Accedi al tuo account"

ab fill '.v-dialog input[type=email]' "$LATUASPESA_EMAIL"
ab fill '.v-dialog input[type=password]' "$LATUASPESA_PASSWORD"
# The dialog's own scrim stays on top until the open transition ends, so wait
# until the submit button is the element a click at its centre would hit.
ab wait --fn "(() => { const b = document.querySelector('.v-dialog button.primary'); if (!b) return false; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && b.contains(hit) })()"
ab click '.v-dialog button.primary'

# The header greets the account by name; that is the only reliable proof the
# login took, since the site never leaves the home page URL. A refused login
# answers with an alert instead, so wait for whichever lands first.
ab wait --fn "document.body.innerText.includes('Ciao') || !!document.querySelector('[role=alert], .v-alert')" >/dev/null || true

if ab eval "document.body.innerText.includes('Ciao')" | grep -q true; then
  echo "✓ logged in as $LATUASPESA_EMAIL"
else
  echo "✗ login refused: $(ab eval "(document.querySelector('[role=alert], .v-alert')?.innerText || 'no message').trim()")" >&2
  echo "  the login endpoint sits behind reCAPTCHA Enterprise and answers 403" >&2
  echo "  when it distrusts the browser; retry later or log in by hand once and" >&2
  echo "  let --restore keep the cookies." >&2
  exit 1
fi
