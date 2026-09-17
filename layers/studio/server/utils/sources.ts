import type { DeckGrant } from '#shared/access'
import type { ProjectDirectory } from '#shared/projects'
import type { ContentSource, DeckDirectory } from '@vignettes/core/deck'
import { strongerGrant } from '#shared/access'
import { eq } from 'drizzle-orm'
import { createDbContent } from '../db/content-store'
import { createDeckMeta } from '../db/deck-meta'
import { createDbDirectory } from '../db/directory'
import { createPermissionStore } from '../db/permission-store'
import { createProjectPermissionStore } from '../db/project-permission-store'
import { createProjectStore } from '../db/project-store'
import { decks } from '../db/schema'
import { createVersionHistory } from '../db/version-history'
import { useDb } from './db'

/**
 * The database is the runtime source of truth for all deck content and metadata;
 * `presentations/` git is the exported archive, never read at request time.
 */

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

/** The published versions of a deck, for the history panel. */
export function useVersionHistory() {
  return createVersionHistory(useDb())
}

/** Deck catalog/access metadata rows (truth for managed decks). */
export function useDeckMeta() {
  return createDeckMeta(useDb())
}

/** Per-deck permission grants. */
export function usePermissionStore() {
  return createPermissionStore(useDb())
}

/** Project-scoped permission grants (master key over a project's decks). */
export function useProjectPermissionStore() {
  return createProjectPermissionStore(useDb())
}

/** Project lifecycle writes (create / rename / trash / restore / purge). */
export function useProjectStore() {
  return createProjectStore(useDb())
}

/**
 * Effective grants: per-deck grants folded with the grants a user holds on each
 * deck's project (the stronger scope wins). This is what access decisions and the
 * catalog consume, so a project grant transparently opens every deck in the project.
 */
export function useGrants() {
  const db = useDb()
  const deckStore = createPermissionStore(db)
  const projectStore = createProjectPermissionStore(db)

  return {
    async get(deckSlug: string, userId: number): Promise<DeckGrant | undefined> {
      const deck = db.select({ project: decks.project }).from(decks).where(eq(decks.slug, deckSlug)).get()
      const [deckGrant, projectGrant] = await Promise.all([
        deckStore.get(deckSlug, userId),
        deck?.project ? projectStore.get(deck.project, userId) : Promise.resolve(null),
      ])
      return strongerGrant(deckGrant ?? undefined, projectGrant ?? undefined)
    },

    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const [deckGrants, projectGrants] = await Promise.all([
        deckStore.listForUser(userId),
        projectStore.listForUser(userId),
      ])
      const effective = new Map(deckGrants)
      if (projectGrants.size > 0) {
        for (const { slug, project } of db.select({ slug: decks.slug, project: decks.project }).from(decks).all()) {
          const pg = project ? projectGrants.get(project) : undefined
          if (pg)
            effective.set(slug, strongerGrant(effective.get(slug), pg)!)
        }
      }
      return effective
    },
  }
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
