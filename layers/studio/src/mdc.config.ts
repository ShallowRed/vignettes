import { defineConfig } from '@nuxtjs/mdc/config'
import { codeRolesTransformer } from '@vignettes/core/render'

// Code tokens get the class of their role, which the deck's code theme colors
// (frontmatter `code`). ROLES_THEME is registered in `mdc.highlight` (nuxt.config.ts).
export default defineConfig({
  shiki: {
    transformers: [codeRolesTransformer()],
  },
})
