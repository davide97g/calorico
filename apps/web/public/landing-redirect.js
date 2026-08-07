/**
 * Sends an already-signed-in visitor from the marketing page straight to the
 * diary.
 *
 * It exists because the app used to live at `/`. Installed PWAs from before the
 * split still have `/` as their start_url until the browser picks up the new
 * manifest, and every old bookmark points here too — without this they would
 * open on the pitch instead of on today's meals.
 *
 * A separate file rather than an inline script so the page keeps a
 * `script-src 'self'` policy, and deferred so it never delays first paint. It
 * only ever reads one key: no session, no token, no redirect, which is exactly
 * what a crawler sees.
 */
;(function () {
  var TOKEN_KEY = 'calorico.token'

  // An explicit ?vetrina lets a signed-in user look at the landing page anyway.
  if (window.location.search.indexOf('vetrina') !== -1) return

  var token = null
  try {
    token = window.localStorage.getItem(TOKEN_KEY)
  } catch {
    // Safari in private mode throws on localStorage; treat it as signed out.
    return
  }

  if (!token) return

  // replace(), not assign(): the back button should leave the site rather than
  // bounce between the pitch and the diary.
  window.location.replace('/app')
})()
