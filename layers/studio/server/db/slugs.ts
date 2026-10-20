import { slugifyProject } from '../../shared/projects/schema.ts'

/** First free project slug from the title: the slug, then `-2`, `-3`… while `taken` holds it. */
export function freeProjectSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugifyProject(title) || 'projet'
  let slug = base
  let n = 2
  while (taken.has(slug))
    slug = `${base}-${n++}`
  return slug
}
