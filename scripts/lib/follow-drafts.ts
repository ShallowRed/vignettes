import type { ContentRewrites } from '../../layers/studio/server/db/ports.ts'
import { followDraftUpdate } from '../../layers/studio/shared/collab/ydoc.ts'

/** A deck the script gave a new published version: the version it replaced (null for a deck never published) and the new one. */
export interface Followed {
  slug: string
  previous: string | null
  next: string
}

/**
 * After the content scripts publish new versions, the draft of each deck that
 * held the version it replaced follows the new one, in its Yjs lineage; a draft
 * with other text stays. The scripts open the database file with no collab
 * server: an editor open meanwhile on a SQLite database keeps its own room,
 * whose next store merges into the draft. A draft that follows takes the date
 * `at`, so a solo save loaded before refuses to overwrite it. Returns the slugs
 * whose draft followed.
 */
export async function followDrafts(rewrites: ContentRewrites, followed: Followed[], at: Date): Promise<string[]> {
  if (!followed.length)
    return []
  const bySlug = new Map(followed.map(entry => [entry.slug, entry]))
  const { drafts } = await rewrites.rewrite(content => ({
    drafts: content.drafts.flatMap(({ slug, ydoc }) => {
      const entry = bySlug.get(slug)
      const next = entry && followDraftUpdate(ydoc, entry.previous, entry.next)
      return next ? [{ slug, ydoc: next }] : []
    }),
  }), { at })
  return drafts.map(draft => draft.slug)
}
