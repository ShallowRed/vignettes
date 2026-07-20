import type { ContentSource, DeckDirectory } from '#shared/deck'
import type { ProjectDirectory } from '#shared/projects'
import { createDbContent } from '../db/content-store'
import { createDeckMeta } from '../db/deck-meta'
import { createDbDirectory } from '../db/directory'
import { createPermissionStore } from '../db/permission-store'
import { useDb } from './db'
import { readPresentationContent } from './presentations'

/**
 * Server adapters implementing the `ContentSource` port. The database is the
 * runtime source of truth (`presentations/` git is the exported archive, not a
 * runtime input); `fileSource` remains only for the admin write path, which
 * still reports whether a slug is shadowed by a committed stub.
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

/** Published deck markdown: the database version. */
export const publishedSource: ContentSource = {
  id: 'db',
  load(slug) {
    return useDbContent().source.load(slug)
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

// Directories resolve the db handle lazily (per call), so the connection is only
// opened after the migration plugin has run — never at module import.

/** Alias directory: database rows (aliases, lifecycle, frozen-bundle mapping). */
export const deckDirectory: DeckDirectory = {
  resolveAlias: alias => createDbDirectory(useDb()).decks.resolveAlias(alias),
  list: () => createDbDirectory(useDb()).decks.list(),
}

/** Project directory: database rows. */
export const projectDirectory: ProjectDirectory = {
  list: () => createDbDirectory(useDb()).projects.list(),
  resolve: slug => createDbDirectory(useDb()).projects.resolve(slug),
}
