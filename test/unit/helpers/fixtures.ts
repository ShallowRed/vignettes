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

/** Paths that leave the directory a file route serves, as the route parameter may carry them. */
export const ESCAPING_PATHS = [
  '../package.json',
  '..%2Fpackage.json',
  '%2e%2e/package.json',
  '%2E%2E%2Fpackage.json',
  'bundle/..%2F..%2Fpackage.json',
  '..%5Cpackage.json',
  'bundle%5C..%5C..%5Cpackage.json',
  'bundle/index.html%00.png',
  'bundle/.',
  '%E0%A4%A',
]
