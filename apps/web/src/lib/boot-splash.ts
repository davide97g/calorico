/**
 * Takes down the boot screen that index.html paints before this bundle exists.
 *
 * The splash and BrandLoader draw the same mark at the same size, so the
 * crossfade between them is invisible as long as the app has actually painted
 * first — hence the two frames. The minimum on-screen time keeps a warm cache
 * from flashing a half-faded logo for 80ms.
 */

/** Measured from navigation start, which is where performance.now() counts from. */
const MIN_VISIBLE_MS = 520

/** Long enough for the 300ms CSS fade, short enough not to strand the node. */
const FADE_TIMEOUT_MS = 600

export function dismissBootSplash() {
  const splash = document.getElementById('boot')
  if (!splash) return

  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())

  window.setTimeout(() => {
    // First frame commits React's tree, second one gets it on screen; only then
    // is there anything behind the splash worth uncovering.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        splash.dataset.state = 'done'
        const remove = () => splash.remove()
        splash.addEventListener('transitionend', remove, { once: true })
        // transitionend never fires if the tab is backgrounded mid-fade.
        window.setTimeout(remove, FADE_TIMEOUT_MS)
      }),
    )
  }, wait)
}
