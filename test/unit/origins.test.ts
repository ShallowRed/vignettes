import type { RouteSide } from '#shared/origins'
import { readdirSync } from 'node:fs'
import { deckPage, isDeckPage, routeSide } from '#shared/origins'
import { describe, expect, it } from 'vitest'
import { nitroRoutes, samplePath } from './helpers/nitro-routes'

function pageRoutes(dir = new URL('../../layers/studio/src/pages/', import.meta.url), prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? pageRoutes(new URL(`${entry.name}/`, dir), `${prefix}/${entry.name}`)
    : [`GET ${entry.name === 'index.vue' ? prefix || '/' : `${prefix}/${entry.name.replace(/\.vue$/, '')}`}`])
}

function sideOf(route: string): RouteSide {
  const [method, pattern] = route.split(' ') as [string, string]
  return routeSide(method, samplePath(pattern))
}

// Every route, with the origin it answers on. A new route fails this test
// until it is written here, and in `shared/origins/routes.ts` when a deck page
// reads it.
const SIDES: Record<string, RouteSide> = {
  'PATCH /api/admin/decks/:slug': 'studio',
  'GET /api/admin/decks/:slug/permissions': 'studio',
  'POST /api/admin/decks/:slug/permissions': 'studio',
  'DELETE /api/admin/decks/:slug/permissions/:userId': 'studio',
  'PUT /api/admin/decks/:slug/permissions/:userId': 'studio',
  'POST /api/admin/hash-password': 'studio',
  'DELETE /api/admin/projects/:slug': 'studio',
  'PATCH /api/admin/projects/:slug': 'studio',
  'GET /api/admin/projects/:slug/permissions': 'studio',
  'DELETE /api/admin/projects/:slug/permissions/:userId': 'studio',
  'PUT /api/admin/projects/:slug/permissions/:userId': 'studio',
  'POST /api/admin/projects': 'studio',
  'POST /api/admin/themes/reload': 'studio',
  'DELETE /api/admin/trash/decks/:slug': 'studio',
  'POST /api/admin/trash/decks/:slug/restore': 'studio',
  'GET /api/admin/trash': 'studio',
  'DELETE /api/admin/trash/projects/:slug': 'studio',
  'POST /api/admin/trash/projects/:slug/restore': 'studio',
  'GET /api/admin/users': 'studio',
  'DELETE /api/admin/users/:id': 'studio',
  'PATCH /api/admin/users/:id': 'studio',
  'DELETE /api/admin/users/:id/tokens': 'studio',
  'POST /api/admin/users/invite': 'studio',
  'GET /api/auth/providers': 'studio',
  'GET /api/auth/session': 'both',
  'GET /api/content/decks': 'studio',
  'POST /api/content/push': 'studio',
  'POST /api/content/theme-rename': 'studio',
  'POST /api/media': 'studio',
  'GET /api/p/:alias': 'both',
  'GET /api/pictograms': 'studio',
  'POST /api/p/:alias/unlock': 'both',
  'GET /api/presentations': 'studio',
  'POST /api/presentations': 'studio',
  'DELETE /api/presentations/:slug': 'studio',
  'GET /api/presentations/:slug': 'both',
  'PUT /api/presentations/:slug': 'studio',
  'POST /api/presentations/:slug/duplicate': 'studio',
  'GET /api/presentations/:slug/history': 'studio',
  'GET /api/presentations/:slug/markdown': 'studio',
  'POST /api/presentations/:slug/publish': 'studio',
  'POST /api/presentations/:slug/snapshots': 'studio',
  'GET /api/presentations/:slug/snapshots/:id': 'studio',
  'POST /api/presentations/:slug/snapshots/:id/restore': 'studio',
  'POST /api/presentations/:slug/unlock': 'both',
  'GET /api/presentations/:slug/versions/:id': 'studio',
  'POST /api/presentations/:slug/versions/:id/restore': 'studio',
  'GET /api/presentations/:slug/viewer': 'both',
  'GET /api/projects': 'studio',
  'POST /api/recette/branch': 'studio',
  'POST /api/recette/seed': 'studio',
  'GET /api/recette/status': 'studio',
  'GET /api/templates': 'studio',
  'GET /api/themes/version-gaps': 'studio',
  'DELETE /api/tokens/:id': 'studio',
  'DELETE /api/tokens/current': 'studio',
  'GET /api/tokens/current': 'studio',
  'GET /api/tokens': 'studio',
  'POST /api/tokens': 'studio',
  'GET /auth/dev-login': 'studio',
  'GET /auth/github': 'studio',
  'GET /auth/google': 'studio',
  'GET /auth/logout': 'studio',
  'POST /auth/logout': 'studio',
  'GET /auth/recette': 'studio',
  'POST /auth/recette': 'studio',
  'GET /backgrounds/**:path': 'both',
  'POST /backgrounds/**:path': 'studio',
  'GET /collab': 'studio',
  'POST /collab': 'studio',
  'GET /deck-pass': 'deck',
  'GET /frozen/**:path': 'deck',
  'POST /frozen/**:path': 'studio',
  'GET /images/**:path': 'both',
  'POST /images/**:path': 'studio',
  'GET /media/**:path': 'both',
  'POST /media/**:path': 'studio',
  'GET /pictograms/**:path': 'both',
  'POST /pictograms/**:path': 'studio',
  'GET /themes/**:path': 'both',
  'POST /themes/**:path': 'studio',
  'GET /__nuxt_error': 'both',
  'POST /__nuxt_error': 'studio',
  'GET /_og/d/**': 'both',
  'POST /_og/d/**': 'studio',
  'GET /_og/d': 'both',
  'POST /_og/d': 'studio',
  'GET /_og/s/**': 'both',
  'POST /_og/s/**': 'studio',
  'GET /_og/s': 'both',
  'POST /_og/s': 'studio',
  'GET /_og/r/**': 'both',
  'POST /_og/r/**': 'studio',
  'GET /_og/r': 'both',
  'POST /_og/r': 'studio',
  'GET /api/_mdc/highlight': 'both',
  'POST /api/_mdc/highlight': 'studio',
  'DELETE /api/_auth/session': 'studio',
  'GET /api/_auth/session': 'both',
  'GET /api/_nuxt_icon/:collection': 'both',
  'POST /api/_nuxt_icon/:collection': 'studio',
  'GET /_i18n/:hash/:locale/messages.json': 'both',
  'POST /_i18n/:hash/:locale/messages.json': 'studio',
  'GET /__nuxt_island/**': 'both',
  'POST /__nuxt_island/**': 'studio',
  'GET /': 'studio',
  'GET /edit/[slug]': 'studio',
  'GET /login': 'studio',
  'GET /p/[alias]': 'deck',
  'GET /projects/[slug]': 'studio',
  'GET /recette': 'studio',
  'GET /slides/[slug]': 'deck',
  'GET /tokens': 'studio',
  'GET /trash': 'studio',
  'GET /unlock/[slug]': 'deck',
  'GET /users': 'studio',
}

describe('routeSide', () => {
  it('classifies every route of the server and every page', () => {
    const routes = [...nitroRoutes(), ...pageRoutes()]
    expect(Object.fromEntries(routes.map(route => [route, sideOf(route)]))).toEqual(SIDES)
  })

  it('reads the path without its query or its fragment', () => {
    expect(routeSide('GET', '/slides/talk?draft#/2/0')).toBe('deck')
    expect(routeSide('GET', '/api/presentations/talk?draft')).toBe('both')
  })

  it('keeps a write to a deck on the studio', () => {
    expect(routeSide('PUT', '/api/presentations/talk')).toBe('studio')
    expect(routeSide('POST', '/frozen/talk/')).toBe('studio')
  })

  it('names the pages of a deck', () => {
    expect(['/slides/talk', '/p/talk-2026', '/unlock/talk', '/frozen/talk/index.html'].every(isDeckPage)).toBe(true)
    expect(['/slides/', '/edit/talk', '/', '/login', '/deck-pass'].some(isDeckPage)).toBe(false)
    expect(deckPage('/frozen/talk-2026/slides/talk--standalone/?x#/2')).toEqual({ page: 'frozen', rest: 'talk-2026/slides/talk--standalone/' })
  })
})
