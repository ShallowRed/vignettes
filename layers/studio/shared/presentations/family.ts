/**
 * Pure rules of the families: decks that are versions of one presentation (a
 * language, a format), and decks replaced by a newer edition.
 */

interface FamilyMember {
  slug: string
  project?: string | null
  family?: string | null
  supersededBy?: string | null
}

/**
 * True when making `target` replace `slug` would close a loop: `target` is
 * `slug`, or `target` is already replaced, directly or not, by `slug`.
 */
export function replacementLoops(slug: string, target: string, decks: Pick<FamilyMember, 'slug' | 'supersededBy'>[]): boolean {
  const next = new Map(decks.map(d => [d.slug, d.supersededBy ?? null]))
  const seen = new Set<string>()
  let cursor: string | null = target
  while (cursor && !seen.has(cursor)) {
    if (cursor === slug)
      return true
    seen.add(cursor)
    cursor = next.get(cursor) ?? null
  }
  return false
}

/**
 * The folder a family lives in, from its members other than `slug`; undefined
 * when nobody else belongs to it yet. A family never spans two folders.
 */
export function familyFolder(family: string, slug: string, decks: Pick<FamilyMember, 'slug' | 'project' | 'family'>[]): string | null | undefined {
  const other = decks.find(d => d.slug !== slug && d.family === family)
  return other ? other.project ?? null : undefined
}

/** The other decks of `slug`'s family, `slug` included, in the order given. */
export function variantsOf<T extends Pick<FamilyMember, 'slug' | 'family' | 'supersededBy'>>(slug: string, decks: T[]): T[] {
  const me = decks.find(d => d.slug === slug)
  if (!me?.family)
    return []
  return decks.filter(d => d.family === me.family && !d.supersededBy)
}
