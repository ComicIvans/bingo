// https://nuxt.com/docs/api/configuration/nuxt-config
const isDev = process.env.NODE_ENV !== 'production'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: isDev },

  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'Bingo',
      meta: [{ name: 'description', content: 'Bingo en directo y generador de cartones.' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  runtimeConfig: {
    // Overridden at runtime by NUXT_ADMIN_KEY, NUXT_SESSION_PASSWORD and
    // NUXT_DATA_DIR. The server refuses admin logins while adminKey is empty.
    adminKey: '',
    sessionPassword: '',
    dataDir: './.data/bingo',
  },

  icon: {
    serverBundle: { collections: ['lucide'] },
  },

  // The viewer, board and panel read live data; the generator is a client app.
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
    '/generador': { ssr: false },
    // The panel must not be framed by other sites (clickjacking). The public
    // screen and the board stay embeddable.
    '/panel': { headers: { 'X-Frame-Options': 'DENY' } },
    '/panel/**': { headers: { 'X-Frame-Options': 'DENY' } },
  },

  nitro: {
    // Ship gzip/brotli copies of the static files (the bundled fonts weigh
    // ~10 MB) so any server or proxy can send them compressed.
    compressPublicAssets: { gzip: true, brotli: true },
  },

  vite: {
    optimizeDeps: {
      include: ['pdf-lib', '@pdf-lib/fontkit', 'uqr'],
    },
    worker: {
      format: 'es',
    },
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
})
