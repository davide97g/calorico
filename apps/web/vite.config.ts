import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Status bar / splash colours, kept in sync with --background in index.css. */
const BACKGROUND_LIGHT = '#f4f5ef'
const LIME = '#dcf58f'

/**
 * Identity of this build, baked into the bundle and written to version.json.
 *
 * Two very different readers need the same string: the browser, which reports
 * the build it is running so the server knows whether that device is behind
 * (src/lib/build.ts), and the API, which polls version.json to learn what is
 * deployed and pushes a notification to the devices still on the old one.
 *
 * The build clock is what generates it, not git: the Docker build context has no
 * .git, and what matters is only that a new build gets a name the old one never
 * had. BUILD_ID can be set from outside to pin it — a rebuild of the same commit
 * would otherwise count as a new release, which is the honest answer anyway
 * since the bytes are new.
 */
const BUILD_ID = process.env.BUILD_ID?.trim() || String(Date.now())

/**
 * Publishes the build id at a fixed URL the API can poll.
 *
 * A file rather than an env var shared by both containers: Dokploy builds the
 * two images separately from the same commit and has nothing to hand them a
 * common value with, so the deployed bundle is the only thing that can be
 * trusted to say which build is live. nginx serves it `no-store` and workbox
 * never precaches it (its glob covers no .json), so the answer is always the
 * running deployment's, not a cached one's.
 */
function versionManifest(buildId: string): Plugin {
  return {
    name: 'calorico:version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({
          buildId,
          builtAt: new Date().toISOString(),
        })}\n`,
      })
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionManifest(BUILD_ID),
    VitePWA({
      // 'prompt' keeps the new worker waiting until we decide to activate it, so
      // src/lib/pwa.ts can reload at a moment that never eats a half-typed form.
      registerType: 'prompt',
      // Registration is done by hand in src/lib/pwa.ts.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Calorico — Diario calorie e macro',
        short_name: 'Calorico',
        description:
          'Diario di calorie e macronutrienti con i prodotti dei supermercati italiani.',
        lang: 'it',
        dir: 'ltr',
        // Origin root, matching `id`. A start_url below the root is what broke
        // the installed app: iOS treated a launch at /app as out of the scope
        // it had remembered and opened it in Safari instead of standalone.
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: LIME,
        theme_color: BACKGROUND_LIGHT,
        categories: ['health', 'fitness', 'food'],
        icons: [
          { src: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
        shortcuts: [
          {
            name: 'Aggiungi alimento',
            short_name: 'Aggiungi',
            url: '/add',
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            ],
          },
          {
            name: 'Registra peso',
            short_name: 'Peso',
            url: '/weight',
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            ],
          },
        ],
      },
      workbox: {
        // Push and notification-click handlers, appended to the generated
        // worker. Kept as a public/ file so the workbox build stays generateSW —
        // see public/push-sw.js.
        importScripts: ['/push-sw.js'],
        // The splash screens are big and only ever read by iOS at launch time,
        // so they stay out of the precache.
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        // push-sw.js is fetched by importScripts, not by the page: precaching it
        // would only keep a second, staler copy of the same file.
        //
        // The legal pages are excluded too. They are read once, in the browser,
        // and shipping them inside the app's precache would mean a new deploy of
        // the privacy notice forcing every installed diary to re-download its
        // worker.
        globIgnores: [
          '**/splash/**',
          'push-sw.js',
          'privacy.html',
          'termini.html',
          'marketing.css',
          'og.png',
          'llms.txt',
        ],
        navigateFallback: '/index.html',
        // The app owns the root, so the fallback is everything except the paths
        // nginx answers with static HTML of their own. Without the denylist an
        // installed app would serve the shell for /privacy and never show the
        // notice again — nor a 404 that is real.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/privacy$/,
          /^\/termini$/,
          /^\/404\.html$/,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // No runtime caching rules: the fonts used to be the only cross-origin
        // request and they are served from public/fonts now, so everything the
        // app loads is already in the precache.
      },
      // A worker in dev only gets in the way of HMR.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
