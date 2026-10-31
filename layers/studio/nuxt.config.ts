import { fileURLToPath } from 'node:url'
import { themePackageVersions } from '@vignettes/nuxt/build/theme-build'
import { SECURITY_HEADERS } from './server/utils/security-headers'

/** One file per area of the interface, the same list for every locale. */
const MESSAGE_FILES = ['common', 'catalog', 'deck', 'editor', 'reference', 'admin', 'account', 'auth', 'recette']
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
  modules: [
    '@nuxtjs/i18n',
    'nuxt-og-image',
    (_options, nuxt) => {
      if (!nuxt.options._prepare)
        nuxt.options.runtimeConfig.themePackages = themePackageVersions(nuxt.options.rootDir)
    },
  ],
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
  runtimeConfig: {
    // The versions of the theme packages this build compiles with, which
    // `server/utils/themes.ts` compares with those of the published themes.
    themePackages: {} as Record<string, string>,
    public: {
      // Links of an instance, in the header and the status bar of the editor,
      // hidden while empty; `NUXT_PUBLIC_HELP_URL` and `NUXT_PUBLIC_FEEDBACK_URL`
      // set them. The documentation of the project is the default help; the
      // editor adds the paths of the pages of the documentation site to it.
      helpUrl: 'https://vignettes.io/docs',
      feedbackUrl: '',
      // The sentence of the home page for a visitor without an account;
      // `NUXT_PUBLIC_WELCOME` sets it, and the studio messages give one while empty.
      welcome: '',
      // The name of the instance after the product name, in the header, the
      // page titles and the link previews; `NUXT_PUBLIC_INSTANCE_NAME` sets it.
      instanceName: '',
      // The interface theme of the instance, one of `UI_THEMES` in
      // src/utils/ui-themes.ts; `NUXT_PUBLIC_UI_THEME` sets it.
      uiTheme: '',
      // The origin of the deck pages, apart from the studio, which the link to
      // a deck names; `NUXT_PUBLIC_DECKS_URL` sets it (see `serverConfig().origins`).
      decksUrl: '',
    },
  },
  css: [fileURLToPath(new URL('./src/assets/css/tailwind.css', import.meta.url))],
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
  // Nitro sets route rule headers on every response it matches; a handler may
  // replace one (https://nitro.build/config#routerules).
  // nuxt-site-config reads a route without an `ssr` rule as rendered on the
  // client and writes its state in a body script, which the page policy blocks.
  routeRules: {
    '/**': { headers: SECURITY_HEADERS, ssr: true },
  },
  nitro: {
    // The starting points of a new deck, read by `server/utils/templates.ts`.
    serverAssets: [{ baseName: 'templates', dir: fileURLToPath(new URL('./templates', import.meta.url)) }],
  },
})
