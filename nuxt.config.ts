import type { SessionConfig } from 'h3'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { ROLES_THEME, ROLES_THEME_KEY } from '@vignettes/core/render'
import { readBundleConfig } from '@vignettes/freeze/bundle'

const bundle = readBundleConfig()

export default defineNuxtConfig({
  compatibilityDate: '2024-11-27',

  extends: ['./layers/studio'],

  alias: {
    // MDC loads the themes it highlights with from `@shikijs/themes/<name>`.
    [`@shikijs/themes/${ROLES_THEME.name}`]: fileURLToPath(new URL('./layers/studio/src/shiki-roles-theme.ts', import.meta.url)),
  },

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

  // `pnpm build:themes` compiles the themes and generates their tokens before Nuxt starts.
  vignettes: {
    compileThemes: false,
  },

  // Workspace packages ship TypeScript sources: transpiled by Vite, inlined by Nitro.
  build: {
    transpile: ['@vignettes/core', '@vignettes/typographie'],
  },

  ui: {
    // Reveal themes own their typography; keep the system font stack for the app.
    fonts: false,
  },

  // The link preview images, drawn by the server on request: a frozen bundle has no server.
  ogImage: {
    enabled: !bundle.enabled,
  },

  icon: {
    mode: 'svg', // SVG mode for better SSR support
    serverBundle: {
      // ri and fluent: slide/mdc components; lucide: Nuxt UI app chrome.
      collections: ['ri', 'fluent', 'lucide'],
    },
  },

  mdc: {
    headings: {
      anchorLinks: false,
    },
    highlight: {
      // Dark, high-contrast code blocks on light slides. The roles theme names the
      // role of each token, which the deck's code theme colors (frontmatter `code`).
      theme: { default: 'github-dark', [ROLES_THEME_KEY]: ROLES_THEME.name },
      langs: ['json', 'yaml', 'markdown', 'js', 'ts', 'bash', 'mermaid'],
    },
  },

  // The desktop app keeps the worktrees of other sessions under `.claude/`,
  // each with its `node_modules`: watching them exhausts the file descriptors
  // of the dev server (macOS caps a process at 10 240). The frozen bundles are
  // static output.
  ignore: ['.claude/**', '.frozen/**'],

  vite: {
    server: { watch: { ignored: ['**/.claude/**', '**/.frozen/**'] } },
    // The SSR Vite server runs in middleware mode with `hmr: false`; Vite then
    // still opens an unused websocket server on 24678, which collides with any
    // other Vite dev server on the machine. It has no client: drop it.
    // @ts-expect-error @nuxt/vite-builder types `$server` as Vite's EnvironmentOptions, which has no `server` key. Nuxt 4.5.2 still applies it: port 24678 opens when this line is removed.
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
      // A frozen bundle ships a reduced public/ without the icons.
      link: bundle.publicDir
        ? []
        : [
            { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
            { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
          ],
    },
  },

  runtimeConfig: {
    // The lifetimes of a session, passed to h3 `useSession` by nuxt-auth-utils
    // (https://github.com/atinux/nuxt-auth-utils#configuration). `maxAge`, in
    // seconds, counts from the login. `seal.ttl`, in milliseconds, is the life
    // of each seal, and `keepSessionActive`, called by the `session-activity`
    // middleware, reseals a session in use: a session that no request uses for
    // two hours ends.
    session: {
      // The default of the module: `NUXT_SESSION_PASSWORD` gives the value at runtime.
      password: '',
      maxAge: 8 * 60 * 60,
      // h3 spreads `seal` over the iron defaults, and its type asks for all of them.
      seal: { ttl: 2 * 60 * 60 * 1000 } as SessionConfig['seal'],
    },
    // Shared TTL (ms) for the file/registry content sources.
    sourceCacheTtlMs: process.env.NUXT_SOURCE_CACHE_TTL_MS || '',
    public: {
      // Theme of a deck that declares none; `NUXT_PUBLIC_DEFAULT_THEME` overrides it.
      defaultTheme: 'dsfr',
    },
    // The rest of the server configuration is read from process.env at runtime
    // in layers/studio/server/utils/config.ts (NUXT_FROZEN_S3_* don't fit Nuxt's
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
        if (['/index.html', '/200.html', '/404.html', '/'].includes(route.route ?? '')
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
      // The migrations of each adapter, read at boot by the migration plugin
      // (drizzle needs a real folder next to the bundle).
      for (const driver of ['sqlite', 'postgres']) {
        const srcDir = join(process.cwd(), 'layers/studio/server/db', driver, 'migrations')
        const destDir = join(nitro.options.output.serverDir, 'migrations', driver)
        try {
          await cp(srcDir, destDir, { recursive: true })
          console.log(`✅ Copied ${srcDir} to build output`)
        }
        catch (error) {
          console.error(`❌ Failed to copy ${srcDir}:`, (error as Error).message)
        }
      }
    },
  },
})
