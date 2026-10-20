import { slugifyProject } from '../../shared/projects/schema.ts'

/** First free project slug from the title: the slug, then `-2`, `-3`… while `isTaken` says so. */
export function freeProjectSlug(title: string, isTaken: (slug: string) => boolean): string {
  const base = slugifyProject(title) || 'projet'
  let slug = base
  let n = 2
  while (isTaken(slug))
    slug = `${base}-${n++}`
  return slug
}
