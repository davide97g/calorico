/**
 * Keeps the app at 1× on touch devices.
 *
 * `user-scalable=no` in the viewport meta covers Android and an installed iOS
 * PWA, but Safari on iOS has ignored it since iOS 10 — pinching there still
 * scales the page and leaves the fixed bottom bar floating in the middle of the
 * screen. These WebKit-only gesture events are the one handle we get on it.
 *
 * The other two zoom paths are handled without JS: double-tap by
 * `touch-action: manipulation` on the body, and focus zoom by the 16px floor on
 * form controls. Both live in index.css.
 */
export function lockZoom() {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), {
      passive: false,
    })
  }
}
