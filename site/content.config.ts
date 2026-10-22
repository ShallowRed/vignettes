import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@nuxt/content'
import { references } from './references'

// The `docs` collection of Docus, extended with the references of
// `references.ts`, each published under its own path.
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
        ...references.map(({ file, path }) => ({
          cwd: dirname(fileURLToPath(new URL(`../${file}`, import.meta.url))),
          include: basename(file),
          prefix: path,
        })),
      ],
    }),
  },
})
