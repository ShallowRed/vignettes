import { join } from 'node:path'
import process from 'node:process'
import { readBundleConfig } from '@vignettes/freeze/bundle'
import presentationWatcher from './plugins/presentation-watcher.js'

const bundle = readBundleConfig()

export default defineNuxtConfig({
  compatibilityDate: '2024-11-27',

  extends: ['./layers/studio'],

  // Frozen bundles build against a reduced public/ to avoid shipping ~11MB of
  // photos + all theme backgrounds.
  ...(bundle.publicDir
    ? { dir: { public: bundle.publicDir } }
    : {}),

  features: {
    // Bundle mode: produce hydration-free HTML with all CSS inlined so the deck
    // needs no JS. inlineStyles must inline ALL CSS (not just `.vue`), else e.g.
    // reveal.css stays a <link> into the deleted _nuxt/ dir and 404s.
    noScripts: bundle.enabled,
    inlineStyles: bundle.enabled ? () => true : undefined,
  },

  // @nuxt/ui registers @nuxt/icon, @nuxt/fonts and @nuxtjs/color-mode itself.
  // Pinia + Pinia Colada power the app-wide data layer (queries + mutations with
  // SSR hydration, cache invalidation and optimistic updates).
  modules: ['@pinia/nuxt', '@pinia/colada-nuxt', '@nuxtjs/mdc', 'nuxt-auth-utils', '@nuxt/ui', '@vignettes/nuxt', '@vignettes/schemas', '@vignettes/storybook'],

  // Workspace packages ship TypeScript sources: transpiled by Vite, inlined by Nitro.
  build: {
    transpile: ['@vignettes/core', '@vignettes/typographie'],
  },

  ui: {
    // Reveal themes own their typography; keep the system font stack for the app.
    fonts: false,
  },

  icon: {
    mode: 'svg', // SVG mode for better SSR support
    serverBundle: {
      // ri: slide/mdc components; lucide: Nuxt UI app chrome.
      collections: ['ri', 'lucide'],
    },
  },

  mdc: {
    headings: {
      anchorLinks: false,
    },
    highlight: {
      // Dark, high-contrast code blocks on light slides.
      theme: 'github-dark',
      langs: ['json', 'yaml', 'markdown', 'js', 'ts', 'bash', 'mermaid'],
    },
  },

  vite: {
    // Tailwind's vite plugin comes with @nuxt/ui; the theme watcher comes with
    // the @vignettes/nuxt module. Only the content watcher is the app's own.
    plugins: [presentationWatcher()],
    // The SSR Vite server runs in middleware mode with `hmr: false`; Vite then
    // still opens an unused websocket server on 24678, which collides with any
    // other Vite dev server on the machine. It has no client: drop it.
    $server: { server: { ws: false } },
  },

  app: {
    baseURL: bundle.baseUrl,
    head: {
      title: 'Vignettes',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },

  runtimeConfig: {
    // Shared TTL (ms) for the file/registry content sources.
    sourceCacheTtlMs: process.env.NUXT_SOURCE_CACHE_TTL_MS || '',
    // Frozen-bundle S3 config is read from process.env at runtime in
    // server/routes/frozen/[...path].ts (NUXT_FROZEN_S3_* don't fit Nuxt's
    // runtime-override convention, and config is baked at build time).
  },

  // Bundle mode: prerender ONLY the deck's slug + its API — not the app shell
  // (/, /login) nor the global API index (dead pages in a single-deck bundle).
  routeRules: bundle.enabled
    ? {
        '/slides/**': { prerender: true },
        '/api/presentations/**': { prerender: true },
      }
    : {
        // ONE rendering strategy: render everything per request.
        //
        // Mixing prerender/SSR across routes cost us a long, confusing hunt: what
        // a deck contains and who may see it both depend on the session AND on
        // the database, neither of which exists at build time. Any prerendered
        // copy is therefore frozen on the anonymous, database-less view, and the
        // client has to patch it after hydration — a race we kept losing.
        //
        // Prerendering can come back later, route by route, for pages that are
        // genuinely static. Until then, uniform SSR is the safe default.
        '/admin': { redirect: '/' },
      },

  nitro: {
    // Experimental until Nitro v3; carries the /collab realtime endpoint.
    experimental: {
      websocket: true,
    },

    externals: {
      inline: ['@vignettes/core', '@vignettes/typographie'],
    },

    prerender: {
      // The app never prerenders, whatever the preset: every page and the catalog
      // API depend on the session and on the database, and neither exists at
      // build time. Only bundle mode (a single, frozen, self-contained deck) does.
      crawlLinks: bundle.enabled,
      routes: [],
    },
    hooks: {
      // Bundle mode: skip SPA fallbacks + the prerendered API json (a single-deck
      // static bundle doesn't fetch it).
      'prerender:generate': function (route) {
        if (!bundle.enabled)
          return
        if (['/index.html', '/200.html', '/404.html', '/'].includes(route.route)
          || route.route?.startsWith('/api/')) {
          route.skip = true
        }
      },
    },
  },

  hooks: {
    'nitro:config': async function (nitroConfig) {
      // Standalone bundle mode: restrict prerender to a single slug.
      const onlySlug = bundle.onlySlug
      if (onlySlug) {
        nitroConfig.prerender = nitroConfig.prerender || {}
        nitroConfig.prerender.crawlLinks = false
        // Only the deck's slug + its API; no '/' (dead weight in a single-deck bundle).
        nitroConfig.prerender.routes = [
          `/slides/${onlySlug}`,
          `/api/presentations/${onlySlug}`,
        ]
      }

      // Outside bundle mode the app prerenders nothing. Public deck pages used to
      // be prerendered from the stubs, which froze their body at build time: a
      // deck edited in the app kept serving its old file content to visitors.
      // Now that the database is the truth, every deck page is rendered per
      // request. Re-introducing SSG here means invalidating on publish first.
    },
    'nitro:build:public-assets': async function (nitro) {
      const { cp } = await import('node:fs/promises')
      // migrations: read at boot by the migration plugin (drizzle needs a real
      // folder next to the bundle). Content is served from the database, so
      // presentations/ is no longer shipped.
      const srcDir = join(process.cwd(), 'layers/studio/server/db/migrations')
      const destDir = join(nitro.options.output.serverDir, 'migrations')
      try {
        await cp(srcDir, destDir, { recursive: true })
        console.log(`✅ Copied ${srcDir} to build output`)
      }
      catch (error) {
        console.error(`❌ Failed to copy ${srcDir}:`, error.message)
      }
    },
  },
})
