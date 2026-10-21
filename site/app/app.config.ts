export default defineAppConfig({
  docus: {
    locale: 'fr',
  },
  seo: {
    title: 'Vignettes',
  },
  header: {
    title: 'Vignettes',
  },
  github: false,
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'neutral',
    },
    // An inline address, or a package name as a title, breaks at any
    // character, so a long one stays inside a phone screen.
    prose: {
      code: {
        base: 'wrap-anywhere',
      },
      h1: {
        slots: {
          base: 'wrap-anywhere',
        },
      },
    },
  },
})
