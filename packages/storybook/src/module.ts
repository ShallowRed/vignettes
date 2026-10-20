import { fileURLToPath } from 'node:url'
import { addComponentsDir, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * Embeds a live Storybook story in a slide. The story id resolves against the
 * deck's `storybook` root, and an iframe renders at a logical width then scales
 * down so the whole page is visible.
 */
export default defineNuxtModule({
  meta: {
    name: '@vignettes/storybook',
    configKey: 'vignettesStorybook',
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
    // Serves the iframe scaler at /scaled-frame.js, which the client plugin loads.
    nuxt.options.nitro.publicAssets ||= []
    nuxt.options.nitro.publicAssets.push({ dir: resolver.resolve('./runtime/public'), maxAge: 0 })
    addPlugin(resolver.resolve('./runtime/plugins/scaled-frame.client'))
  },
})
