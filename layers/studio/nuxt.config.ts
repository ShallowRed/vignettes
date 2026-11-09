import { fileURLToPath } from 'node:url'
import { readBundleConfig } from '@vignettes/freeze/bundle'
import { themePackageVersions } from '@vignettes/nuxt/build/theme-build'
import { SECURITY_HEADERS } from './server/utils/security-headers'
import { UI_FONT_FAMILIES } from './src/utils/ui-themes'

/** One file per area of the interface, the same list for every locale. */
const MESSAGE_FILES = ['common', 'catalog', 'deck', 'editor', 'reference', 'admin', 'account', 'auth', 'recette', 'privacy']
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
  // @nuxt/fonts before nuxt-og-image, which draws the link previews with the
  // typefaces it serves.
  modules: [
    '@nuxtjs/i18n',
    '@nuxt/fonts',
    'nuxt-og-image',
    (_options, nuxt) => {
      if (!nuxt.options._prepare)
        nuxt.options.runtimeConfig.themePackages = themePackageVersions(nuxt.options.rootDir)
    },
    // A frozen bundle has no server and runs no script.
    ...(readBundleConfig().enabled ? [] : ['@sentry/nuxt/module']),
  ],
  // The errors alone, without the upload of the source maps. The built server
  // reads its Sentry configuration only through this import: the container
  // starts it without `--import`.
  sentry: {
    autoInjectServerSentry: 'top-level-import',
    sourceMapsUploadOptions: { enabled: false },
    telemetry: false,
  },
  srcDir: 'src/',
  fonts: {
    families: UI_FONT_FAMILIES,
  },
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
      // The Umami service of the instance and its two websites, off while empty;
      // `NUXT_PUBLIC_UMAMI_HOST` and `NUXT_PUBLIC_UMAMI_*_WEBSITE_ID` set them.
      // `NUXT_PUBLIC_UMAMI_RETENTION_MONTHS` is the period the privacy page states.
      umami: {
        host: '',
        studioWebsiteId: '',
        decksWebsiteId: '',
        retentionMonths: '',
      },
      // The error tracker of the instance, off while empty;
      // `NUXT_PUBLIC_ERROR_TRACKING_DSN` and `NUXT_PUBLIC_ERROR_TRACKING_ENVIRONMENT` set them.
      // `NUXT_PUBLIC_ERROR_TRACKING_RETENTION_DAYS` is the period the privacy page states.
      errorTracking: {
        dsn: '',
        environment: '',
        retentionDays: '',
      },
      // The address the privacy page gives for questions, hidden while empty;
      // `NUXT_PUBLIC_PRIVACY_CONTACT` sets it.
      privacyContact: '',
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
