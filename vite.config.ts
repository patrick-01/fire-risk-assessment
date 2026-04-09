import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TODO: Add vite-plugin-pwa here for service worker / offline support.
// import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // TODO: Uncomment and configure when adding offline/PWA support:
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
    //   manifest: {
    //     name: 'Richmond Fire Compliance Tool',
    //     short_name: 'FireCheck',
    //     theme_color: '#c0392b',
    //   },
    // }),
  ],
  // Hash-based routing so GitHub Pages / Netlify / Vercel all work with
  // no server-side redirect config required.
  base: '/fire-risk-assessment/',
})
