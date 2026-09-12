import { fileURLToPath } from 'node:url'
import {
  addComponentsDir,
  addImportsDir,
  addPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import themeWatcher from './build/theme-watcher.js'

export interface ModuleOptions {
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

    // Unprefixed and global: the deck body names its components in markdown, so
    // `resolveComponent('Quote')` has to find them at runtime.
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
      global: true,
    })

    // Deck composables and the pure slide helpers, available to the host's pages.
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))

    addPlugin(resolver.resolve('./runtime/plugins/theme-registry'))
    addPlugin(resolver.resolve('./runtime/plugins/french-typography'))
    addPlugin(resolver.resolve('./runtime/plugins/scaled-frame.client'))

    if (options.watchThemes && nuxt.options.dev) {
      nuxt.options.vite.plugins ||= []
      nuxt.options.vite.plugins.push(themeWatcher())
    }
  },
})
