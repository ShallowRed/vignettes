import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@nuxt/content'

// The `docs` collection of Docus, extended with the references kept beside the
// code: the READMEs of the packages an author reads, under the reference of the
// Écrire section, and the theme system with the READMEs of the theme packages,
// under the reference of the Thèmes section.
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: [
        {
          cwd: fileURLToPath(new URL('./content', import.meta.url)),
          include: '**',
          exclude: ['index.md'],
          prefix: '/',
        },
        {
          cwd: fileURLToPath(new URL('../packages', import.meta.url)),
          include: '{nuxt,schemas,storybook}/README.md',
          prefix: '/ecrire/reference',
        },
        {
          cwd: fileURLToPath(new URL('../packages', import.meta.url)),
          include: '{theme-kit,theme-dsfr}/README.md',
          prefix: '/themes/reference',
        },
        {
          cwd: fileURLToPath(new URL('../docs', import.meta.url)),
          include: 'theme-system.md',
          prefix: '/themes/reference',
        },
      ],
    }),
  },
})
