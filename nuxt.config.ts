// https://nuxt.com/docs/api/configuration/nuxt-config
import { join } from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import presentationWatcher from './plugins/presentation-watcher.js'
import themeWatcher from './plugins/theme-watcher.js'
import { readBundleConfig } from './shared/build/bundle'
import { discoverPublicSlugs } from './shared/build/public-decks'

// Single typed read of the standalone-bundle toggles (audit §7 P2 #10).
const bundle = readBundleConfig()

// Self-host (Docker) build. En preset node-server, le prérendu écrit les routes
// sur un vrai filesystem : `/api/presentations` (fichier) et
// `/api/presentations/<slug>` (dossier) entrent en collision (EISDIR), et crawler
// les liens suit `/auth/github` qui exige les secrets OAuth au build. On sert donc
// ces routes API en SSR au runtime (rapides, cache TTL) et on ne crawle pas — le
// SSG des pages `/slides/<slug>` appelle l'API en interne sans l'écrire sur disque.
// Les autres presets (build par défaut) et le mode bundle ne sont PAS concernés.
const preset = process.env.NITRO_PRESET || ''
const isNodeServer = preset === 'node_server' || preset === 'node-server'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-27',

  srcDir: 'src/',

  // Frozen bundles build against a reduced public/ (build-reduced-public.js) instead
  // of the whole repo public/ (~11 Mo of home photos + all themes' backgrounds).
  ...(bundle.publicDir
    ? { dir: { public: bundle.publicDir } }
    : {}),

  features: {
    // Reveal-only frozen deck (DDR-017 §2.a-ter), bundle mode only. Together these
    // produce hydration-free HTML with all CSS inlined, so the deck needs no JS:
    //   noScripts → no entry script / _payload / preload hints (slides are in the
    //     SSR markup since we dropped <ClientOnly>, nothing to hydrate).
    //   inlineStyles: () => true → inline ALL CSS, not just `.vue` (the default
    //     predicate). Composable-level CSS (e.g. reveal.css) would otherwise stay a
    //     <link> into the deleted _nuxt/ dir and 404.
    noScripts: bundle.enabled,
    inlineStyles: bundle.enabled ? () => true : undefined,
  },

  modules: ['@nuxtjs/mdc', 'nuxt-auth-utils', '@nuxt/icon'],

  css: ['~/assets/css/tailwind.css'],

  icon: {
    // Remix Icons are installed locally via @iconify-json/ri
    // Usage: <Icon name="ri:home-line" /> or in markdown: :i{name="ri:home-line"}
    mode: 'svg', // SVG mode for better SSR support
    serverBundle: {
      collections: ['ri'],
    },
  },

  mdc: {
    headings: {
      anchorLinks: false,
    },
    highlight: {
      // Coloration syntaxique shiki : blocs sombres et contrastés sur slides claires.
      theme: 'github-dark',
      langs: ['json', 'yaml', 'markdown', 'js', 'ts', 'bash', 'mermaid'],
    },
  },

  vite: {
    plugins: [tailwindcss(), themeWatcher(), presentationWatcher()],
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
    // Self-hosted CodiMD instance URL (server-only for fetching)
    codimdUrl: process.env.NUXT_CODIMD_URL || '',
    // HackMD.io API token for Bearer auth (server-only, never exposed to client)
    hackmdApiToken: process.env.NUXT_HACKMD_API_TOKEN || '',
    // Single, shared TTL (ms) for content sources + registry (audit §5.7 / P1 #6).
    sourceCacheTtlMs: process.env.NUXT_SOURCE_CACHE_TTL_MS || '',
    // Frozen-bundle object storage (Scaleway) is read from process.env AT RUNTIME
    // in server/routes/frozen/[...path].ts (the NUXT_FROZEN_S3_* names don't fit
    // Nuxt's runtime-override convention, and config is baked at build time).
    public: {
      // Exposed to client for building "Edit" links
      codimdUrl: process.env.NUXT_CODIMD_URL || '',
    },
  },

  // Hybrid rendering: SSG for public slides, SSR for protected routes.
  // In bundle mode (BUNDLE_ONLY_SLUG, DDR-017 §2.a-ter) we ONLY want the deck's
  // own slug + its API — not the app shell (/, /login) nor the global API index,
  // which would otherwise be prerendered into the bundle as dead pages.
  routeRules: bundle.enabled
    ? {
        '/slides/**': { prerender: true },
        '/api/presentations/**': { prerender: true },
      }
    : {
        // Index and login are prerendered
        '/': { prerender: true },
        '/login': { prerender: true },

        // Public slides are prerendered (SSG) - more specific first
        '/slides/public/**': { prerender: true },

        // Protected/dynamic slides require SSR - after specific rules
        '/slides/**': { ssr: true },
        '/unlock/**': { ssr: true },
        '/admin/**': { ssr: true },

        // API: public presentations can be prerendered
        '/api/presentations': { prerender: true },

        // API: protected presentations require SSR (cookies, auth)
        '/api/presentations/**': { ssr: true },
      },

  nitro: {
    // Bundle the `presentations/` folder (stubs + registry.yml) as a server asset
    // so it is reachable at runtime through `useStorage('assets:presentations')`
    // regardless of the process working directory. This is what makes the live
    // `/p/<alias>` route + the registry work in production (DDR-018).
    serverAssets: [
      { baseName: 'presentations', dir: join(process.cwd(), 'presentations') },
    ],

    // `.frozen-mirror/` → / : the future-proof origin-root asset safety net for a
    // non-rebased consumer (bundles are self-contained and don't need it). Lives
    // OUTSIDE public/ so `nuxt generate` never aspirates it into the next build.
    //
    // The frozen BUNDLES themselves (`/frozen/<bundle>/…`) are NO LONGER served
    // from a committed `.frozen/` dir: they live in object storage (Scaleway) and
    // are served — with access gating — by `server/routes/frozen/[...path].ts`
    // (DDR-018 storage migration; see docs/frozen-storage.md). That route falls
    // back to the local `.frozen/` dir when S3 creds are absent (dev/transition).
    publicAssets: [
      { dir: join(process.cwd(), '.frozen-mirror'), baseURL: '/', maxAge: 0 },
    ],
    prerender: {
      // Crawl links to discover routes (désactivé en node-server : voir isNodeServer
      // — évite de suivre /auth/github, qui exige les secrets OAuth au build).
      crawlLinks: !isNodeServer,
      // Only prerender public presentations API (non prérendue en node-server pour
      // éviter la collision fichier/dossier EISDIR ; servie en SSR au runtime).
      routes: isNodeServer ? [] : ['/api/presentations'],
    },
    hooks: {
      // In bundle mode, skip the SPA fallbacks (index/200/404) + the prerendered
      // API json — dead weight in a single-deck static bundle.
      'prerender:generate': function (route) {
        if (!bundle.enabled)
          return
        // Skip SPA fallbacks (the deck is a single static Reveal page) and the
        // prerendered API json (the deck is static — it no longer fetches it).
        if (['/index.html', '/200.html', '/404.html', '/'].includes(route.route)
          || route.route?.startsWith('/api/')) {
          route.skip = true
        }
      },
    },
  },

  // Hook to discover and prerender only PUBLIC presentation routes
  hooks: {
    'nitro:config': async function (nitroConfig) {
      // BUNDLE_ONLY_SLUG: restrict prerender to a single slug (standalone bundle mode)
      const onlySlug = bundle.onlySlug
      if (onlySlug) {
        nitroConfig.prerender = nitroConfig.prerender || {}
        nitroConfig.prerender.crawlLinks = false
        // ONLY the deck's slug + its API. No '/' (the app home is dead weight in a
        // single-deck bundle); the fallback files are skipped via prerender:generate.
        nitroConfig.prerender.routes = [
          `/slides/${onlySlug}`,
          `/api/presentations/${onlySlug}`,
        ]
        return
      }

      try {
        // Status now lives in the frontmatter (docs/presentation-metadata.md), so
        // public decks are discovered by parsing stubs, not by listing public/.
        const slugs = await discoverPublicSlugs(join(process.cwd(), 'presentations'))

        // En node-server, on ne prérend QUE la page SSG du deck ; son API JSON est
        // servie en SSR (éviter la collision fichier/dossier EISDIR sur le FS).
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
      const srcDir = join(process.cwd(), 'presentations')
      const destDir = join(nitro.options.output.serverDir, 'presentations')

      try {
        await cp(srcDir, destDir, { recursive: true })
        console.log('✅ Copied presentations folder to build output')
      }
      catch (error) {
        console.error('❌ Failed to copy presentations:', error.message)
      }
    },
  },
})
