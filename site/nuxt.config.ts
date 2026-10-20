import { fileURLToPath } from 'node:url'

// The documentation site: a Docus application that installs the render module
// and its two extension modules, so the pages show live decks.
//
// `themes` links to the themes of the repository: the render module compiles
// the themes of `<rootDir>/themes` and has no option for another directory.
export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['@vignettes/nuxt', '@vignettes/schemas', '@vignettes/storybook'],

  site: {
    name: 'Vignettes',
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

  nitro: {
    // The pictograms of `Scheme` steps, served as the studio serves them.
    publicAssets: [
      { dir: fileURLToPath(new URL('../public/pictograms', import.meta.url)), baseURL: '/pictograms', maxAge: 0 },
    ],
  },

  hooks: {
    // A package README is published at the path of its package, without the
    // `readme` segment its file name gives it.
    'content:file:afterParse': ({ content }) => {
      if (typeof content.path === 'string' && content.path.endsWith('/readme'))
        content.path = content.path.slice(0, -'/readme'.length)
    },
  },

  compatibilityDate: '2025-07-22',
})
