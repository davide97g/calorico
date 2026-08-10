import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Status bar / splash colours, kept in sync with --background in index.css. */
const BACKGROUND_LIGHT = '#f4f5ef'
const LIME = '#dcf58f'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
