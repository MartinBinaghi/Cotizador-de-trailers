import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En la app de escritorio los archivos ya están en el equipo: un service worker
// solo sirve la versión anterior después de actualizar (y esa versión vieja no
// puede abrir una base ya migrada). El CLI de Tauri define TAURI_ENV_PLATFORM al
// compilar; ahí se genera un service worker que se elimina solo, borra la copia
// guardada por versiones anteriores y recarga la app con los archivos reales.
const esEscritorio = Boolean(process.env.TAURI_ENV_PLATFORM)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      selfDestroying: esEscritorio,
      registerType: 'autoUpdate',
      // Todo funciona offline: precachea el bundle completo
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Cotizador de Trailers',
        short_name: 'Cotizador',
        description: 'App para cotizar trailers según tipo y variables configurables',
        theme_color: '#0A0908',
        background_color: '#F6F4EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    // Permite abrir la app desde otras PCs de la misma red si hace falta
    host: true
  }
})
