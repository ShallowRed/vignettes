import type { H3Event } from 'h3'
import { assertCanEditDeck } from './access'
import { replaceDraft, useDraftStore } from './collab'
import { readVersionId } from './version-id'

/**
 * The restore routes: the entry named by `:slug` and `:id` becomes the draft,
 * which the editors review and publish again. The visitors keep the current
 * version until then, and the replaced draft stays in the history as a
 * snapshot.
 */
export async function restoreIntoDraft(event: H3Event, entries: { name: string, load: (slug: string, id: number) => Promise<{ raw: string } | null> }) {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  const editor = await assertCanEditDeck(event, slug)
  if (!useDraftStore().isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }
  const entry = await entries.load(slug, readVersionId(event))
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: `${entries.name} not found` })
  }
  await replaceDraft(slug, entry.raw, editor.login)
  return { ok: true, stamp: await useDraftStore().stamp(slug) }
}
