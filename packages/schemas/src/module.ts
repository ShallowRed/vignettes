import { fileURLToPath } from 'node:url'
import { addComponentsDir, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * Components that explain a system on a slide: pictogram steps linked by arrows,
 * diagrams whose cards are placed on a grid or ranked automatically, and a file
 * read beside the description of what it holds.
 */
export default defineNuxtModule({
  meta: {
    name: '@vignettes/schemas',
    configKey: 'vignettesSchemas',
    compatibility: { nuxt: '>=4.0.0' },
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = fileURLToPath(new URL('./runtime', import.meta.url))

    nuxt.options.build.transpile.push(runtime)
    nuxt.options.nitro.externals ||= {}
    nuxt.options.nitro.externals.inline ||= []
    nuxt.options.nitro.externals.inline.push(runtime)

    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
      global: true,
    })
    addPlugin(resolver.resolve('./runtime/plugins/register'))
  },
})
