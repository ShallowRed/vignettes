/**
 * Save a deck's markdown as its draft.
 * PUT /api/presentations/:slug   body: { raw }
 *
 * Saving and publishing are distinct acts: this persists the draft (through the
 * `DraftStore` port); `POST /:slug/publish` turns the draft into the served
 * version. Refused while a collab room is open — overwriting the live CRDT with
 * a fresh document would fork it. A solo save carries the `stamp` it loaded:
 * when someone else saved since, it is refused (409, `data.conflict`) rather
 * than silently replacing their work — last-writer-wins is not acceptable.
 */

import { prepareDeckWrite } from '#shared/deck'
import { markdownToYDocUpdate } from '#shared/deck/ydoc'
import { assertCanEditDeck } from '../../utils/access'
import { useCollabServer, useDraftStore } from '../../utils/collab'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  await assertCanEditDeck(event, slug)

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }

  if (useCollabServer().documents.has(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; edits flow through it' })
  }

  const body = await readBody(event)
  const raw = body?.raw

  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { raw: string }' })
  }

  // `stamp` is what the client loaded (null = no draft then). Undefined means a
  // client that does not participate in the check (kept working).
  const base = body?.stamp
  if (base !== undefined) {
    const current = await drafts.stamp(slug)
    if (current !== (base ?? null)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This draft was saved by someone else since you opened it',
        data: { conflict: true, stamp: current },
      })
    }
  }

  try {
    const prepared = prepareDeckWrite({ slug, raw })
    await drafts.save(prepared.slug, markdownToYDocUpdate(prepared.raw))
    return {
      ok: true,
      key: `draft:${prepared.slug}`,
      bytes: new TextEncoder().encode(prepared.raw).length,
      stamp: await drafts.stamp(prepared.slug),
    }
  }
  catch (error: any) {
    const message = error?.message || 'Failed to save draft'
    const isValidation = /invalid|empty markdown/i.test(message)
    throw createError({ statusCode: isValidation ? 400 : 500, statusMessage: message })
  }
})
