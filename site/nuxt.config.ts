import { fileURLToPath } from 'node:url'
import { UI_FONT_FAMILIES } from '../layers/studio/src/utils/ui-themes'
import { redirects } from './redirects'
import { referenceFolder, references } from './references'

// The documentation site: a Docus application that installs the render module
// and its two extension modules, so the pages show live decks.
//
// `themes` links to the themes of the repository: the render module compiles
// the themes of `<rootDir>/themes` and has no option for another directory.
export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['@nuxt/fonts', '@vignettes/nuxt', '@vignettes/schemas', '@vignettes/storybook'],

  site: {
    name: 'Vignettes',
  },

  fonts: {
    families: UI_FONT_FAMILIES,
  },

  runtimeConfig: {
    public: {
      // The menu of the interface themes on trial, opened in the build made
      // from staging by `NUXT_PUBLIC_UI_TRIALS`.
      uiTrials: false,
      // The Umami service of the site, off while empty: `checks.yml` sets it on a build from `main`.
      umami: {
        host: '',
        websiteId: '',
      },
    },
  },

  // The site is generated as static files: the assistant and the MCP server of
  // Docus need a server or a key.
  docus: {
    assistant: {
      enabled: false,
    },
  },
  mcp: {
    enabled: false,
  },

  // The decks are parsed in the browser, which highlights their code blocks
  // itself: a static site has no highlighting route to call.
  mdc: {
    highlight: {
      noApiRoute: true,
    },
  },

  routeRules: Object.fromEntries(Object.entries(redirects).map(([from, to]) => [from, { redirect: { to, statusCode: 301 } }])),

  nitro: {
    prerender: {
      routes: Object.keys(redirects),
    },
    // The pictograms of `Scheme` steps and the images of the example deck, served as the studio serves them.
    publicAssets: [
      { dir: fileURLToPath(new URL('../public/pictograms', import.meta.url)), baseURL: '/pictograms', maxAge: 0 },
      { dir: fileURLToPath(new URL('../public/images', import.meta.url)), baseURL: '/images', maxAge: 0 },
    ],
  },

  hooks: {
    // A reference is published at its path, without the file name segment
    // its source adds, and sorted by its rank in `references.ts`. It has no
    // frontmatter: Nuxt Content takes its title and description from its first
    // heading and paragraph, which Docus shows above the body, so the hook
    // removes them from the body and gives the page its French title.
    'content:file:afterParse': ({ content }) => {
      const reference = references.find(({ path }) => String(content.path).startsWith(`${path}/`))
      if (!reference)
        return
      const { path, title } = reference
      const rank = references.indexOf(reference) + 1
      content.path = path
      content.stem = `${referenceFolder}/${rank}.${path.split('/').pop()}`
      content.title = title
      content.seo = { ...content.seo as object, title }
      content.navigation = { title }
      const body = content.body as { value: [string, ...unknown[]][] }
      if (body.value[0]?.[0] === 'h1')
        body.value.shift()
      if (body.value[0]?.[0] === 'p')
        body.value.shift()
    },
  },

  compatibilityDate: '2025-07-22',
})
