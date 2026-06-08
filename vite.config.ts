import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update: cuando hay un nuevo SW, se descarga y el banner en
      // src/pwa.ts pide al usuario refrescar para activarlo.
      registerType: 'autoUpdate',

      // El registro lo hacemos manualmente desde src/pwa.ts (setupPWA).
      injectRegister: false,

      // Manifest = SINGLE SOURCE OF TRUTH en public/manifest.json.
      // VitePWA NO debe generar su propio manifest.webmanifest ni inyectar
      // <link rel="manifest"> en el HTML (index.html ya tiene el suyo).
      manifest: false,
      injectManifest: undefined,

      // Assets adicionales a precachear (los iconos los maneja public/).
      includeAssets: ['favicon.svg', 'icon-512.svg', 'icon-maskable.svg', 'manifest.json', 'robots.txt', 'qz-tray.js'],

      workbox: {
        // Precache del app shell: bundle JS/CSS + index.html + assets estáticos.
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,png,jpg,jpeg,webp,ico,json,txt}'],

        // Tamaño máximo por archivo en precache (5 MB).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // SPA: cualquier navegación sin recurso → index.html.
        navigateFallback: '/index.html',

        // No interceptar /api/ ni rutas con extensión (sitemap, manifest, etc.).
        navigateFallbackDenylist: [
          /^\/api\//,
          /\.[a-z0-9]+$/i,
        ],

        // Limpia caches viejos de versiones anteriores al activar SW nuevo.
        cleanupOutdatedCaches: true,

        // Toma control inmediato de las pestañas abiertas.
        clientsClaim: true,
        skipWaiting: false, // el usuario decide cuándo aplicar update (banner)

        runtimeCaching: [
          // ── Tipografías de Google ─────────────────────────────────────────
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── Imágenes (productos, logos del recibo) — cache largo ────────
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── Storage de Supabase (imágenes de productos) ──────────────────
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── Auth de Supabase: SIEMPRE network, nunca cachear tokens ─────
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly',
          },

          // ── DB REST de Supabase: SIEMPRE network (datos sensibles) ──────
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },

      devOptions: {
        // En dev el SW no se registra para no estorbar HMR.
        enabled: false,
      },
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Source maps para que Sentry pueda mapear stack traces minificados.
    sourcemap: true,

    rollupOptions: {
      output: {
        // Chunking manual: separa libs grandes para mejor caching.
        // Rolldown (Vite 8) solo acepta la forma de FUNCIÓN para manualChunks.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@sentry'))                                                   return 'sentry';
          if (id.includes('@supabase'))                                                 return 'supabase';
          if (id.includes('/recharts/') || id.includes('/d3-'))                         return 'recharts';
          if (id.includes('/konva') || id.includes('/react-konva'))                     return 'konva';
          if (id.includes('/react-router'))                                             return 'react';
          if (id.includes('/react-dom/') || id.match(/\/node_modules\/react\//))        return 'react';
          return undefined;
        },
      },
    },
  },
})
