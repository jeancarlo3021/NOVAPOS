import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-512.svg', 'icon-maskable.svg', 'qz-tray.js'],
      manifest: {
        name: 'ColònClick',
        short_name: 'ColònClick',
        description: 'Sistema de gestión y punto de venta',
        theme_color: '#10b981',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'es-CR',
        icons: [
          { src: '/favicon.svg',       sizes: '64x64',                  type: 'image/svg+xml', purpose: 'any'      },
          { src: '/icon-512.svg',      sizes: '192x192 512x512 any',    type: 'image/svg+xml', purpose: 'any'      },
          { src: '/icon-maskable.svg', sizes: '512x512',                type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: precachea HTML/JS/CSS + assets emitidos por Vite.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Tamaño máximo por archivo precacheado (5 MB).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SPA: cualquier ruta sin recurso → index.html.
        navigateFallback: '/index.html',
        // No interceptar /api/ con el fallback; el módulo offline propio
        // (offlineCache + offlineQueue) ya gestiona esa capa.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Tipografías de Google (si llegas a usarlas) → cache largo.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Habilita el SW también en `npm run dev` para probar el comportamiento
        // offline e instalación. Cambia a true si quieres servir el SW en dev.
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
})
