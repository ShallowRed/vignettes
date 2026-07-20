import type { ContentSource, DeckDirectory } from '#shared/deck'
import type { ProjectDirectory } from '#shared/projects'
import { createDbContent } from '../db/content-store'
import { createDeckMeta } from '../db/deck-meta'
import { createDbDirectory } from '../db/directory'
import { createPermissionStore } from '../db/permission-store'
import { useDb } from './db'
import { readPresentationContent } from './presentations'
import { fileProjects } from './projects'
import { fileDirectory } from './registry'

/**
 * Server adapters implementing the `ContentSource` port — the only place that
 * knows how to reach each backing. Adding a source is one adapter here.
 */

export const fileSource: ContentSource = {
  id: 'file',
  async load(slug) {
    const result = await readPresentationContent(slug)
    return result == null ? null : { raw: result.content }
  },
}

/** The database-backed content ports (published versions). */
export function useDbContent() {
  return createDbContent(useDb())
}

/**
 * Published deck markdown: the database version when one exists, else the
 * committed file — the transition chain that lets decks migrate one publish at
 * a time with no bulk seed.
 */
export const publishedSource: ContentSource = {
  id: 'db',
  async load(slug) {
    return await useDbContent().source.load(slug) ?? await fileSource.load(slug)
  },
}

/** Deck catalog/access metadata rows (truth for managed decks). */
export function useDeckMeta() {
  return createDeckMeta(useDb())
}

/** Per-deck permission grants. */
export function usePermissionStore() {
  return createPermissionStore(useDb())
}

/**
 * Alias directory: database entries first, registry.yml for everything not yet
 * migrated — same per-entry chain as `publishedSource` (a db entry shadows the
 * yaml one for its alias and its slug).
 */
export const deckDirectory: DeckDirectory = {
  async resolveAlias(alias) {
    const dbDir = createDbDirectory(useDb()).decks
    return await dbDir.resolveAlias(alias) ?? await fileDirectory.resolveAlias(alias)
  },

  async list() {
    const dbDir = createDbDirectory(useDb()).decks
    const [fromDb, fromFile] = await Promise.all([dbDir.list(), fileDirectory.list()])
    const claimedAliases = new Set(fromDb.map(e => e.alias))
    const claimedSlugs = new Set(fromDb.map(e => e.slug))
    return [
      ...fromDb,
      ...fromFile.filter(e => !claimedAliases.has(e.alias) && !claimedSlugs.has(e.slug)),
    ]
  },
}

/** Project directory: database rows override yaml ones slug by slug. */
export const projectDirectory: ProjectDirectory = {
  async list() {
    const dbDir = createDbDirectory(useDb()).projects
    const [fromDb, fromFile] = await Promise.all([dbDir.list(), fileProjects.list()])
    const merged = new Map([...fromFile, ...fromDb].map(p => [p.slug, p]))
    return [...merged.values()].sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY
      const bo = b.order ?? Number.POSITIVE_INFINITY
      return ao !== bo ? ao - bo : (a.title ?? a.slug).localeCompare(b.title ?? b.slug)
    })
  },

  async resolve(slug) {
    const dbDir = createDbDirectory(useDb()).projects
    return await dbDir.resolve(slug) ?? await fileProjects.resolve(slug)
  },
}
