import { fileURLToPath } from 'node:url'

/** One file per area of the interface, the same list for every locale. */
const MESSAGE_FILES = ['common', 'catalog', 'deck', 'editor', 'reference', 'admin', 'auth', 'recette']
const messageFiles = (locale: string) => MESSAGE_FILES.map(area => `${locale}/${area}.json`)

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
  modules: ['@nuxtjs/i18n'],
  srcDir: 'src/',
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'fr',
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français', files: messageFiles('fr') },
      { code: 'en', language: 'en-US', name: 'English', files: messageFiles('en') },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'vignettes_locale', fallbackLocale: 'fr' },
  },
  css: [fileURLToPath(new URL('./src/assets/css/tailwind.css', import.meta.url))],
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
})
