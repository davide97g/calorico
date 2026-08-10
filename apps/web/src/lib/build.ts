/**
 * Which build of the app this browser is running.
 *
 * The value is substituted by vite at build time (see `define` in
 * vite.config.ts) and is the same string the deployment publishes at
 * /version.json. The app reports it once per session so the server can tell a
 * device that already updated itself from one still on the old build, and only
 * push "new version available" to the latter.
 *
 * `typeof` rather than a bare read: in dev and under vitest nothing replaces the
 * identifier, and referencing an undeclared global would throw at import time.
 */
declare const __BUILD_ID__: string

export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
