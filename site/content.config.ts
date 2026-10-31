import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@nuxt/content'
import { references } from './references'

// The `docs` collection of Docus, published under `/docs` and extended with
// the references of `references.ts`, each published under its own path.
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: [
        {
          cwd: fileURLToPath(new URL('./content/docs', import.meta.url)),
          include: '**',
          prefix: '/docs',
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
