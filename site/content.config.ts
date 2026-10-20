import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@nuxt/content'

// The `docs` collection of Docus, extended with the READMEs of the packages an
// author reads, published under the reference of the Écrire section.
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
      ],
    }),
  },
})
