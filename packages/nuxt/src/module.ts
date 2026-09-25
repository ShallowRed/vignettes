import { fileURLToPath } from 'node:url'
import {
  addComponentsDir,
  addImportsDir,
  addPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { compileTheme } from './build/theme-build.ts'
import { discoverThemes } from './build/theme-registry.ts'
import themeWatcher from './build/theme-watcher.js'

export interface ModuleOptions {
  /**
   * Compile the themes of the application and of the content space to
   * `public/themes/` when Nuxt starts, in development and for a build.
   */
  compileThemes?: boolean
  /**
   * Recompile the themes and reload the page when a theme directory or a theme
   * package changes. Development only.
   */
  watchThemes?: boolean
}

/**
 * Renders decks in a Nuxt application: the Reveal layer, the authoring
 * components, the slide parsers and the French orthotypography directive.
 *
 * The host installs `@nuxtjs/mdc` itself, since the deck body is MDC and the
 * application usually configures highlighting and headings for its own content
 * too. The host also owns the routes: it decides which page renders a deck, and
 * where the deck comes from.
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@vignettes/nuxt',
    configKey: 'vignettes',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    compileThemes: true,
    watchThemes: true,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = fileURLToPath(new URL('./runtime', import.meta.url))

    // The package ships TypeScript sources, like the theme packages ship SCSS.
    nuxt.options.build.transpile.push(runtime)
    nuxt.options.nitro.externals ||= {}
    nuxt.options.nitro.externals.inline ||= []
    nuxt.options.nitro.externals.inline.push(runtime)

    // `@vignettes/core` imports slugify, a CommonJS package, which Vite serves
    // unconverted in development unless it pre-bundles it.
    nuxt.options.vite.optimizeDeps ||= {}
    nuxt.options.vite.optimizeDeps.include ||= []
    nuxt.options.vite.optimizeDeps.include.push('@vignettes/nuxt > @vignettes/core > slugify')

    // The authoring components are named in markdown and resolved at runtime by
    // `resolveComponent('Quote')`, which requires them global. Nuxt skips a
    // directory nested in one it has already scanned, so this one comes first.
    addComponentsDir({
      path: resolver.resolve('./runtime/components/mdc'),
      pathPrefix: false,
      global: true,
    })
    // The Reveal shell is used by name in the host's pages, so it stays an
    // ordinary component: its stylesheet then ships in the page's own CSS and is
    // in the HTML from the first paint.
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
    })

    // Deck composables and the pure slide helpers, available to the host's pages.
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))

    addPlugin(resolver.resolve('./runtime/plugins/theme-registry'))
    addPlugin(resolver.resolve('./runtime/plugins/french-typography'))

    // Nitro serves the public directory only when it exists at startup, so the
    // themes compile here, before Nitro starts.
    if (options.compileThemes && !nuxt.options._prepare) {
      for (const theme of discoverThemes(nuxt.options.rootDir))
        compileTheme(nuxt.options.rootDir, theme)
    }

    if (options.watchThemes && nuxt.options.dev) {
      nuxt.options.vite.plugins ||= []
      nuxt.options.vite.plugins.push(themeWatcher())
    }
  },
})
