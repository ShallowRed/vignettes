import type { PresentationListItem } from '../../../layers/studio/shared/presentations/list-item'
import type { Project } from '../../../layers/studio/shared/projects/schema'

/** A catalog entry with the required fields filled from the slug. */
export function listItem(partial: Partial<PresentationListItem> & { slug: string }): PresentationListItem {
  return {
    title: partial.slug,
    theme: 'dsfr',
    status: 'public',
    filename: `${partial.slug}.md`,
    ...partial,
  }
}

export function project(slug: string, extra: Partial<Project> = {}): Project {
  return { slug, title: extra.title ?? slug, ...extra }
}
