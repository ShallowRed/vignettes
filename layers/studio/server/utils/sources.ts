import type { DeckGrant } from '#shared/access'
import type { ProjectDirectory } from '#shared/projects'
import type { ContentSource, DeckDirectory, DeckDirectoryEntry } from '@vignettes/core/deck'
import { strongerGrant } from '#shared/access'
import { deckPage } from '#shared/origins'
import { isDeckSlug } from '@vignettes/core/deck'
import { useStores } from './db'

/**
 * The database is the runtime source of truth for all deck content and metadata;
 * `presentations/` git is the exported archive, never read at request time.
 */

/** The database-backed content ports (published versions). */
export function useDbContent() {
  return useStores().content
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
  return useStores().versionHistory
}

/** Deck catalog/access metadata rows (truth for managed decks). */
export function useDeckMeta() {
  return useStores().deckMeta
}

/** Which decks reference each uploaded image (the visibility of `/media/**`). */
export function useMediaIndex() {
  return useStores().mediaIndex
}

/** Per-deck permission grants. */
export function usePermissionStore() {
  return useStores().deckGrants
}

/** Project-scoped permission grants (master key over a project's decks). */
export function useProjectPermissionStore() {
  return useStores().projectGrants
}

/** Project lifecycle writes (create / rename / trash / restore / purge). */
export function useProjectStore() {
  return useStores().projects
}

/** The rows the content scripts exchange with an instance. */
export function useContentArchive() {
  return useStores().archive
}

/** Rewrites of the stored content, such as a theme rename. */
export function useContentRewrites() {
  return useStores().rewrites
}

/**
 * Effective grants: per-deck grants folded with the grants a user holds on each
 * deck's project (the stronger scope wins). This is what access decisions and the
 * catalog consume, so a project grant transparently opens every deck in the project.
 */
export function useGrants() {
  const stores = useStores()

  return {
    async get(deckSlug: string, userId: number): Promise<DeckGrant | undefined> {
      const project = await stores.deckMeta.projectOf(deckSlug)
      const [deckGrant, projectGrant] = await Promise.all([
        stores.deckGrants.get(deckSlug, userId),
        project ? stores.projectGrants.get(project, userId) : Promise.resolve(null),
      ])
      return strongerGrant(deckGrant ?? undefined, projectGrant ?? undefined)
    },

    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const [deckGrants, projectGrants] = await Promise.all([
        stores.deckGrants.listForUser(userId),
        stores.projectGrants.listForUser(userId),
      ])
      const effective = new Map(deckGrants)
      if (projectGrants.size > 0) {
        for (const [slug, project] of await stores.deckMeta.projectsBySlug()) {
          const pg = project ? projectGrants.get(project) : undefined
          if (pg)
            effective.set(slug, strongerGrant(effective.get(slug), pg)!)
        }
      }
      return effective
    },
  }
}

// Directories resolve the stores lazily (per call), so the connection is only
// opened after the migration plugin has run — never at module import.

/** Alias directory: database rows (aliases, lifecycle, frozen-bundle mapping). */
export const deckDirectory: DeckDirectory = {
  resolveAlias: alias => useStores().deckDirectory.resolveAlias(alias),
  list: () => useStores().deckDirectory.list(),
}

/**
 * The deck the `/frozen/<name>/` segment names: by the bundle it declares, which
 * is the name `/p/` redirects to, or else by its alias.
 */
export async function deckOfBundleName(name: string): Promise<DeckDirectoryEntry | null> {
  const all = await deckDirectory.list()
  return all.find(entry => (entry.frozenBundle ?? entry.slug) === name) ?? await deckDirectory.resolveAlias(name)
}

/**
 * The slug of the deck a page names: `/slides/<slug or alias>`, `/p/<alias>`,
 * `/unlock/<slug or alias>` or `/frozen/<bundle>/…`; `null` for any other path.
 */
export async function deckOfPagePath(path: string): Promise<string | null> {
  const match = deckPage(path)
  if (!match)
    return null
  const { page, rest } = match
  let name: string
  try {
    name = decodeURIComponent(page === 'frozen' ? rest.split('/')[0]! : rest.replace(/\/+$/, ''))
  }
  catch {
    return null
  }
  if (page === 'frozen')
    return isDeckSlug(name) ? (await deckOfBundleName(name))?.slug ?? null : null
  const entry = await deckDirectory.resolveAlias(name)
  if (entry)
    return entry.slug
  return page !== 'p' && isDeckSlug(name) ? name : null
}

/** Project directory: database rows. */
export const projectDirectory: ProjectDirectory = {
  list: () => useStores().projectDirectory.list(),
  resolve: slug => useStores().projectDirectory.resolve(slug),
}
