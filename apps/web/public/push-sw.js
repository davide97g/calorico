/*
 * Push handling for the generated service worker.
 *
 * vite-plugin-pwa builds sw.js from workbox, so this file is pulled in with
 * `workbox.importScripts` (see vite.config.ts) instead of being part of the
 * bundle: two listeners are all we need on top of what workbox generates, and
 * keeping them here leaves the tuned update policy in src/lib/pwa.ts untouched.
 *
 * Plain JS, no build step, no types — it runs inside the worker as-is. nginx
 * serves it `no-store` like sw.js itself, so a deploy can never leave a stale
 * copy of these handlers behind.
 */

/* global self */

/**
 * Reminder payloads carry a react-router path — `/`, `/weight`,
 * `/add?meal=lunch` — and the app is mounted at the origin root, so the path is
 * already the URL to open. The only work left is refusing a payload that is not
 * a path at all, and stripping the `/app` prefix that reminders queued while the
 * app lived there still carry.
 */
function toAppUrl(routerPath) {
  if (typeof routerPath !== 'string' || routerPath[0] !== '/') return '/'
  if (routerPath === '/app') return '/'
  if (routerPath.startsWith('/app/')) return routerPath.slice('/app'.length)
  return routerPath
}

/** Message the page listens for to reload itself; see src/lib/pwa.ts. */
const RELOAD_MESSAGE = 'CALORICO_RELOAD'

/** How long to wait for a freshly fetched worker to finish installing. */
const INSTALL_TIMEOUT_MS = 8000

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A payload we cannot read is still worth a generic notification: on some
    // platforms a push event without showNotification costs the site its
    // permission to push at all.
  }

  const title = data.title || 'Calorico'
  const url = toAppUrl(data.url)
  // A release notice is the one push whose tap does more than open a screen, so
  // the intent travels with the notification rather than being guessed from the
  // tag on the way out.
  const release = data.kind === 'release'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/monochrome-512.png',
      // Same tag replaces the previous one instead of stacking: two "log your
      // lunch" notifications say nothing the first did not.
      tag: data.tag || 'calorico',
      renotify: true,
      data: { url, release },
    }),
  )
})

/**
 * Brings the waiting build into service, fetching it first if the browser has
 * not noticed it yet.
 *
 * The worker cannot activate itself on another worker's behalf — only the
 * waiting one may call skipWaiting — so it is asked by message. The handler that
 * answers is workbox's own SKIP_WAITING listener, generated into every build of
 * sw.js, which is what src/lib/pwa.ts already uses for the in-app toast.
 *
 * Returns whether a new build was handed over, so the caller can tell a reload
 * that will land on the new version from one that will not.
 */
async function activateWaitingBuild() {
  const registration = self.registration

  // The push arrived out of the blue: this worker may never have checked for an
  // update, so ask now. Cheap — sw.js is served no-store and is a few KB.
  if (!registration.waiting) {
    await registration.update().catch(() => {})
  }

  if (!registration.waiting && registration.installing) {
    const installing = registration.installing
    await new Promise((resolve) => {
      const finish = () => {
        installing.removeEventListener('statechange', onChange)
        resolve()
      }
      const onChange = () => {
        // 'installed' is the waiting state; 'redundant' means this candidate
        // died and there is nothing to hand over to.
        if (installing.state === 'installed' || installing.state === 'redundant') {
          finish()
        }
      }
      installing.addEventListener('statechange', onChange)
      setTimeout(finish, INSTALL_TIMEOUT_MS)
    })
  }

  if (!registration.waiting) return false
  registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = toAppUrl(data.url)

  event.waitUntil(
    (async () => {
      // Order matters: the handover is asked for before any window is touched,
      // so `clientsClaim` in the new worker can take over the page we are about
      // to focus and the reload below lands on the new build.
      if (data.release) await activateWaitingBuild()

      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reuse an open window — on iOS a second one would be a second copy of
      // the installed app, which the system will not give us anyway.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if (data.release) {
          // Not `navigate`: the point is a fresh document, and the page knows
          // how to wait for the new worker to take control before reloading.
          client.postMessage({ type: RELOAD_MESSAGE })
          return
        }
        if ('navigate' in client) {
          await client.navigate(url).catch(() => {})
        }
        return
      }

      // Nothing open. A cold start already loads the newest build, since the
      // shell is served no-store and the new worker is in charge by now.
      await self.clients.openWindow(url)
    })(),
  )
})
