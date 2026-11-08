import { UNGROUPED_FOLDER_SLUG } from '../../shared/presentations/folder-view.ts'
import { slugifyProject } from '../../shared/projects/schema.ts'

/** A slug no project takes: `/projects/<UNGROUPED_FOLDER_SLUG>` lists the decks without a project. */
export function isReservedProjectSlug(slug: string): boolean {
  return slug === UNGROUPED_FOLDER_SLUG
}

/** First free project slug from the title: the slug, then `-2`, `-3`… while `taken` holds it or it is reserved. */
export function freeProjectSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugifyProject(title) || 'projet'
  let slug = base
  let n = 2
  while (taken.has(slug) || isReservedProjectSlug(slug))
    slug = `${base}-${n++}`
  return slug
}
