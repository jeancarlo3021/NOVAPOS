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
      includeAssets: [
        'favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png',
        'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png',
        'manifest.json', 'robots.txt', 'qz-tray.js',
      ],

      workbox: {
        // Precache del app shell: bundle JS/CSS + index.html + assets estáticos.
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,png,jpg,jpeg,webp,ico,json,txt}'],

        // Fuera del precache las librerías PESADAS que casi nadie usa el primer
        // día: Excel, gráficos, captura de pantalla, el asistente de alta y los
        // reportes. Son ~1,5 MB que, en un celular con datos, retrasan que la
        // app quede lista. Se descargan la primera vez que se abre esa pantalla
        // y de ahí en adelante quedan en cache por la regla de scripts de abajo.
        globIgnores: [
          '**/xlsx-*.js', '**/recharts-*.js', '**/html2canvas-*.js',
          '**/konva-*.js', '**/CreateOwner-*.js', '**/ReportsDashboard-*.js',
          '**/index.es-*.js',
        ],

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

        // Toma control inmediato de las pestañas abiertas y aplica la versión
        // nueva sin esperar (fuerza refresco del cache al detectar update).
        clientsClaim: true,
        skipWaiting: true,

        runtimeCaching: [
          // ── Documento / navegación: RED PRIMERO ───────────────────────────
          // Un F5 (o abrir la app) trae SIEMPRE el index.html más nuevo desde la
          // red → con él llegan las refs a los bundles nuevos y a los íconos, sin
          // limpiar cache. El cache solo se usa como respaldo si no hay conexión.
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html',
              networkTimeoutSeconds: 4,   // si la red tarda >4s (offline), sirve el cache
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // ── JS/CSS propio no precacheado ──────────────────────────────────
          // Los chunks que se sacaron del precache (Excel, gráficos, reportes):
          // se sirven de cache y se revalidan de fondo, así funcionan offline
          // después de usarlos una vez.
          {
            urlPattern: ({ request, url }) =>
              (request.destination === 'script' || request.destination === 'style')
              && url.origin === self.location.origin,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-chunks',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

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
    // Navegadores soportados.
    //
    // Vite 8 compila por defecto para navegadores MUY recientes. En un celular
    // con Chrome/WebView viejo eso significa que el bundle ni siquiera se puede
    // PARSEAR: no es que la app falle, es que nunca arranca — pantalla en blanco,
    // sin error a la vista y sin que limpiar el caché sirva de nada.
    //
    // Bajar el target cuesta unos KB y elimina toda esa clase de problema.
    target: ['es2019', 'chrome80', 'safari14', 'firefox78', 'edge88'],

    // Source maps para que Sentry pueda mapear stack traces minificados.
    // 'hidden': se generan los .map (Sentry los necesita para desminificar) pero
    // el bundle NO lleva el comentario sourceMappingURL, así que ningún navegador
    // los descarga en producción.
    sourcemap: 'hidden',

    rollupOptions: {
      output: {
        // Chunking manual: separa libs grandes para mejor caching.
        // Rolldown (Vite 8) solo acepta la forma de FUNCIÓN para manualChunks.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@sentry'))                                                   return 'sentry';
          if (id.includes('@supabase'))                                                 return 'supabase';
          // Solo recharts y sus d3 REALES. Antes el patrón '/d3-' se llevaba
          // utilidades chiquitas compartidas con el resto de la app, y por una
          // función de 200 bytes el arranque terminaba precargando los 390 kB
          // del chunk de gráficos.
          // Utilidades DIMINUTAS que comparte media app (clsx, eventemitter3…).
          // Van primero y a su propio chunk: si caen dentro del de gráficos,
          // cualquier pantalla que use una de ellas arrastra 390 kB al arranque.
          if (id.match(/\/node_modules\/(clsx|tiny-invariant|eventemitter3|react-is|use-sync-external-store)\//))
            return 'utils';
          if (id.includes('/node_modules/recharts/'))                                   return 'recharts';
          if (id.match(/\/node_modules\/d3-[a-z]+\//))                                 return 'recharts';
          // recharts 3 arrastra Redux Toolkit para su estado interno. Si queda
          // en el mismo chunk que los gráficos, cualquier módulo que lo toque
          // obliga a precargar 390 kB; separado, se paga solo lo que se usa.
          if (id.includes('/node_modules/@reduxjs/') || id.includes('/node_modules/redux')
              || id.includes('/node_modules/reselect') || id.includes('/node_modules/immer'))
            return 'redux';
          if (id.includes('/konva') || id.includes('/react-konva'))                     return 'konva';
          if (id.includes('/react-router'))                                             return 'react';
          if (id.includes('/react-dom/') || id.match(/\/node_modules\/react\//))        return 'react';
          return undefined;
        },
      },
    },
  },
})
