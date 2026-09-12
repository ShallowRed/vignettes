import type { Project } from '../projects/schema'
import type { PresentationListItem } from './list-item'
import { UNGROUPED_PROJECT } from './catalog-view'

// Pure, framework-free view-model for the catalog's folder grid (the primary
// entry point). Folders are a grouping *view* over the already access-filtered
// catalog, enriched with project metadata (title/color) — never a second,
// unfiltered listing of projects. The server decides which projects are visible
// (see server/utils/catalog.ts); this only shapes what those inputs render to.

/** Reserved route slug for the no-project ("Divers") bucket. */
export const UNGROUPED_FOLDER_SLUG = 'divers'

export interface CatalogFolder {
  /** Route segment: `/projects/<routeSlug>`. */
  routeSlug: string
  title: string
  /** Number of visible decks in the folder. */
  count: number
  color: string | null
  /** Bare lucide name; null = the default folder icon. */
  icon: string | null
  /** Distinct themes across the folder's decks (for the subtitle). */
  themes: string[]
  /** True for the reserved no-project bucket. */
  ungrouped: boolean
}

function themesOf(items: PresentationListItem[]): string[] {
  return [...new Set(items.map(i => i.theme).filter(Boolean))] as string[]
}

/**
 * Build the folder grid from the visible decks and the visible projects.
 *
 * Order: named projects first, in the order they arrive (the API sorts them by
 * `order` then title); orphan folders next (decks pointing at a legacy free-text
 * project with no row), sorted by slug; the ungrouped "Divers" bucket last, only
 * when it holds decks. Empty named folders are kept — the server only returns an
 * empty project to actors allowed to see it (privileged), so a freshly created
 * project is visible before it has any deck.
 */
export function buildCatalogFolders(
  items: PresentationListItem[],
  projects: Project[] = [],
): CatalogFolder[] {
  const buckets = new Map<string, PresentationListItem[]>()
  for (const item of items) {
    const key = item.project ?? UNGROUPED_PROJECT
    if (!buckets.has(key))
      buckets.set(key, [])
    buckets.get(key)!.push(item)
  }

  const named = projects.map(p => p.slug)
  const namedSet = new Set(named)
  const orphans = [...buckets.keys()]
    .filter(k => k !== UNGROUPED_PROJECT && !namedSet.has(k))
    .sort((a, b) => a.localeCompare(b))
  const meta = new Map(projects.map(p => [p.slug, p]))

  const folders: CatalogFolder[] = [...named, ...orphans].map((slug) => {
    const bucket = buckets.get(slug) ?? []
    return {
      routeSlug: slug,
      title: meta.get(slug)?.title ?? slug,
      count: bucket.length,
      color: meta.get(slug)?.color ?? null,
      icon: meta.get(slug)?.icon ?? null,
      themes: themesOf(bucket),
      ungrouped: false,
    }
  })

  const ungrouped = buckets.get(UNGROUPED_PROJECT) ?? []
  if (ungrouped.length) {
    folders.push({
      routeSlug: UNGROUPED_FOLDER_SLUG,
      title: 'Divers',
      count: ungrouped.length,
      color: null,
      icon: null,
      themes: themesOf(ungrouped),
      ungrouped: true,
    })
  }
  return folders
}
