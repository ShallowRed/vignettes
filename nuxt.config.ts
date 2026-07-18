import { join } from 'node:path'
import process from 'node:process'
import presentationWatcher from './plugins/presentation-watcher.js'
import themeWatcher from './plugins/theme-watcher.js'
import { readBundleConfig } from './shared/build/bundle'
import { discoverPublicSlugs } from './shared/build/public-decks'

const bundle = readBundleConfig()

// node-server preset: prerendering `/api/presentations` (file) and
// `/api/presentations/<slug>` (dir) to a real FS collides (EISDIR), and crawling
// follows `/auth/github` which needs OAuth secrets at build. So we serve those API
// routes via SSR at runtime and don't crawl; SSG pages call the API internally.
const preset = process.env.NITRO_PRESET || ''
const isNodeServer = preset === 'node_server' || preset === 'node-server'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-27',

  srcDir: 'src/',

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
  modules: ['@nuxtjs/mdc', 'nuxt-auth-utils', '@nuxt/ui'],

  css: ['~/assets/css/tailwind.css'],

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
    // Tailwind's vite plugin comes with @nuxt/ui; only the app watchers here.
    plugins: [themeWatcher(), presentationWatcher()],
  },

  app: {
    baseURL: bundle.baseUrl,
    head: {
      title: 'Nuxt Slides',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },

  runtimeConfig: {
    codimdUrl: process.env.NUXT_CODIMD_URL || '',
    hackmdApiToken: process.env.NUXT_HACKMD_API_TOKEN || '',
    // Shared TTL (ms) for content sources + registry.
    sourceCacheTtlMs: process.env.NUXT_SOURCE_CACHE_TTL_MS || '',
    // Frozen-bundle S3 config is read from process.env at runtime in
    // server/routes/frozen/[...path].ts (NUXT_FROZEN_S3_* don't fit Nuxt's
    // runtime-override convention, and config is baked at build time).
    public: {
      codimdUrl: process.env.NUXT_CODIMD_URL || '',
    },
  },

  // Bundle mode: prerender ONLY the deck's slug + its API — not the app shell
  // (/, /login) nor the global API index (dead pages in a single-deck bundle).
  routeRules: bundle.enabled
    ? {
        '/slides/**': { prerender: true },
        '/api/presentations/**': { prerender: true },
      }
    : {
        '/': { prerender: true },
        '/login': { prerender: true },
        // Catalog and admin views merged; keep old bookmarks working.
        '/admin': { redirect: '/' },

        // Specific (public, SSG) before generic (protected, SSR).
        '/slides/public/**': { prerender: true },
        '/slides/**': { ssr: true },
        '/unlock/**': { ssr: true },
        '/admin/**': { ssr: true },

        '/api/presentations': { prerender: true },
        // Protected presentations need SSR (cookies, auth).
        '/api/presentations/**': { ssr: true },
      },

  nitro: {
    // Experimental until Nitro v3; carries the /collab realtime endpoint.
    experimental: {
      websocket: true,
    },

    // Ship `presentations/` (stubs + registry.yml) as a server asset so it's
    // reachable at runtime via `useStorage('assets:presentations')` regardless of
    // cwd; this powers the live `/p/<alias>` route + registry in production.
    serverAssets: [
      { baseName: 'presentations', dir: join(process.cwd(), 'presentations') },
    ],

    prerender: {
      // See isNodeServer above: don't crawl in node-server (avoids /auth/github).
      crawlLinks: !isNodeServer,
      // Skip the API prerender in node-server (EISDIR); served via SSR at runtime.
      routes: isNodeServer ? [] : ['/api/presentations'],
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
        return
      }

      try {
        // Public decks are discovered by parsing stub frontmatter (status lives there).
        const slugs = await discoverPublicSlugs(join(process.cwd(), 'presentations'))

        // node-server: prerender only the SSG deck page; its API JSON is SSR (EISDIR).
        const publicRoutes = slugs.flatMap((slug: string) => isNodeServer
          ? [`/slides/${slug}`]
          : [`/slides/${slug}`, `/api/presentations/${slug}`])

        nitroConfig.prerender = nitroConfig.prerender || {}
        nitroConfig.prerender.routes = nitroConfig.prerender.routes || []
        nitroConfig.prerender.routes.push(...publicRoutes)
      }
      catch (error) {
        console.warn('Could not discover public presentation routes:', error)
      }
    },
    'nitro:build:public-assets': async function (nitro) {
      const { cp } = await import('node:fs/promises')
      // presentations/: runtime server asset; migrations: read at boot by the
      // migration plugin (drizzle needs a real folder next to the bundle).
      const copies = [
        [join(process.cwd(), 'presentations'), join(nitro.options.output.serverDir, 'presentations')],
        [join(process.cwd(), 'server/db/migrations'), join(nitro.options.output.serverDir, 'migrations')],
      ]
      for (const [srcDir, destDir] of copies) {
        try {
          await cp(srcDir, destDir, { recursive: true })
          console.log(`✅ Copied ${srcDir} to build output`)
        }
        catch (error) {
          console.error(`❌ Failed to copy ${srcDir}:`, error.message)
        }
      }
    },
  },
})
