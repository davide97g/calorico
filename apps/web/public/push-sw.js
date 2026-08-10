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

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/monochrome-512.png',
      // Same tag replaces the previous one instead of stacking: two "log your
      // lunch" notifications say nothing the first did not.
      tag: data.tag || 'calorico',
      renotify: true,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = toAppUrl(event.notification.data && event.notification.data.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reuse an open window — on iOS a second one would be a second copy of
      // the installed app, which the system will not give us anyway.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if ('navigate' in client) {
          await client.navigate(url).catch(() => {})
        }
        return
      }

      await self.clients.openWindow(url)
    })(),
  )
})
