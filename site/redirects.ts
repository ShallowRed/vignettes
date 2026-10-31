import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { references } from './references'

// The earlier addresses of the documentation pages, at the root of the site
// and, for the references, in the Écrire and Thèmes sections, each with the
// page under `/docs` it redirects to. The site is static: the prerenderer
// writes each redirect as a page, so `nuxt.config.ts` lists them for it.
const contentDir = fileURLToPath(new URL('./content/docs', import.meta.url))

function pagePaths(): string[] {
  return readdirSync(contentDir, { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith('.md') && file !== 'index.md')
    .map(file => `/${file.replace(/\.md$/, '').split('/').map(segment => segment.replace(/^\d+\./, '')).join('/')}`)
}

export const redirects: Record<string, string> = Object.fromEntries([
  ...pagePaths().map(path => [path, `/docs${path}`]),
  ...references.flatMap(({ path, previous }) => [[path.replace(/^\/docs/, ''), path], [previous, path]]),
])
