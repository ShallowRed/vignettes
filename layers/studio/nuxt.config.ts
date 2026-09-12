import { fileURLToPath } from 'node:url'

/**
 * The studio: catalog, folders, access, accounts, editor, collaboration, trash
 * and the acceptance kit. An application extends this layer and adds what is its
 * own: its themes, its brand components, its deployment.
 *
 * `~` resolves to the application's source directory, never to a layer's, so the
 * files here import each other by relative path. `#shared` is redeclared to keep
 * pointing at the domain this layer carries.
 */
export default defineNuxtConfig({
  srcDir: 'src/',
  css: [fileURLToPath(new URL('./src/assets/css/tailwind.css', import.meta.url))],
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
})
