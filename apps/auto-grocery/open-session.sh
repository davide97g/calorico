#!/usr/bin/env bash
# Opens a headed browser on latuaspesa.com with the login form already filled in
# and leaves the last click to a human. reCAPTCHA Enterprise scores a scripted
# login badly and starts answering 403 on the login endpoint; a real click from a
# real window is what gets past it. The cookies land in the restored session, so
# `login.sh` afterwards finds the account already logged in and never touches the
# form again.
#
#   ./open-session.sh     # then click ACCEDI yourself
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$here/.env"; set +a

session=autogrocery
ab() { agent-browser --session "$session" --restore "$@"; }

ab open --headed "$LATUASPESA_BASE_URL"
if [ "$(ab get url | tr -d '[:space:]')" = "about:blank" ]; then
  ab navigate "$LATUASPESA_BASE_URL"
fi

if ab eval "document.body.innerText.includes('Ciao')" | grep -q true; then
  echo "✓ session already logged in as $LATUASPESA_EMAIL — nothing to do"
  exit 0
fi

if ab wait '#CybotCookiebotDialogBodyButtonDecline' >/dev/null 2>&1; then
  ab click '#CybotCookiebotDialogBodyButtonDecline'
  ab wait --fn "(() => { const d = document.getElementById('CybotCookiebotDialog'); return !d || getComputedStyle(d).display === 'none' })()" >/dev/null
fi
if ab wait --text "Soluzioni per la Spesa Online" >/dev/null 2>&1; then
  ab eval "document.querySelector('.vuedl-layout__closeBtn')?.click(); true" >/dev/null
fi
ab wait --fn "Array.from(document.querySelectorAll('.v-overlay__scrim')).every(s => getComputedStyle(s).pointerEvents === 'none' || s.getBoundingClientRect().height === 0)" >/dev/null

ab find role button click --name "Menù account"
ab wait --text "Accedi al tuo account"
ab fill '.v-dialog input[type=email]' "$LATUASPESA_EMAIL"
ab fill '.v-dialog input[type=password]' "$LATUASPESA_PASSWORD"

cat <<'MSG'

Credentials are in the form. Click ACCEDI in the window that just opened.
When the header greets you by name, save the session with:

  agent-browser --session autogrocery --restore close

After that ./login.sh finds the cookies and skips the form.
MSG
