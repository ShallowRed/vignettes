/**
 * Save a deck's markdown as its draft.
 * PUT /api/presentations/:slug   body: { raw }
 *
 * Saving and publishing are distinct acts: this persists the draft (through the
 * `DraftStore` port); `POST /:slug/publish` turns the draft into the served
 * version. Refused while a collab room is open — overwriting the live CRDT with
 * a fresh document would fork it.
 */

import { isPrivileged } from '#shared/access'
import { prepareDeckWrite } from '#shared/deck'
import { markdownToYDocUpdate } from '#shared/deck/ydoc'
import { getActorRole } from '../../utils/actor'
import { useCollabServer, useDraftStore } from '../../utils/collab'

export default defineEventHandler(async (event) => {
  if (!isPrivileged(await getActorRole(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Owner or editor role required' })
  }

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  if (useCollabServer().documents.has(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; edits flow through it' })
  }

  const body = await readBody(event)
  const raw = body?.raw

  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { raw: string }' })
  }

  try {
    const prepared = prepareDeckWrite({ slug, raw })
    await drafts.save(prepared.slug, markdownToYDocUpdate(prepared.raw))
    return { ok: true, key: `draft:${prepared.slug}`, bytes: new TextEncoder().encode(prepared.raw).length }
  }
  catch (error: any) {
    const message = error?.message || 'Failed to save draft'
    const isValidation = /invalid|empty markdown/i.test(message)
    throw createError({ statusCode: isValidation ? 400 : 500, statusMessage: message })
  }
})
