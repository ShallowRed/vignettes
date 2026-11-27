/**
 * Save a deck's markdown as its draft.
 * PUT /api/presentations/:slug   body: { raw, stamp?, publishedVersion?, draftDigest? }
 *
 * Saving and publishing are distinct acts: this writes the text of the draft in
 * its Yjs lineage (`writeDraftText`); `POST /:slug/publish` turns the draft into
 * the served version. Refused while a collab room is open or loading. A solo
 * save carries the `stamp` it loaded: when someone else saved since, it is
 * refused (409, `data.conflict`), and their draft stays. A save that loaded no
 * draft also carries the `publishedVersion` it loaded: an editor opened
 * meanwhile stores the published text as the draft, which the save may replace
 * while that version is still the one served. A save may also carry the
 * `draftDigest` of the draft it loaded (`textDigest`, null = no draft then),
 * which catches a write the stamp, kept to the second, misses: it is refused
 * (409, `data.conflict`) when the stored draft holds another text, except for
 * a save that loaded no draft facing the published version it loaded, as for
 * the stamp; the answer repeats the digest it compared. Each save also leaves
 * a snapshot in the history.
 */

import { DeckWriteError, prepareDeckWrite } from '@vignettes/core/deck'
import { isDigest, textDigest } from '@vignettes/core/digest'
import { assertCanEditDeck } from '../../utils/access'
import { currentDraftText, hasRoom, recordDraftSnapshot, useDraftStore, writeDraftText } from '../../utils/collab'
import { useDbContent } from '../../utils/sources'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const editor = await assertCanEditDeck(event, slug, { contentToken: true })

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }

  if (hasRoom(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; edits flow through it' })
  }

  const body = await readBody(event)
  const raw = body?.raw

  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { raw: string }' })
  }

  const loadedDigest = body.draftDigest
  if (loadedDigest !== undefined && loadedDigest !== null && !isDigest(loadedDigest)) {
    throw createError({ statusCode: 400, statusMessage: 'draftDigest must be null or the SHA-256 of the draft, in lowercase hexadecimal' })
  }

  // `stamp` is what the client loaded (null = no draft then). Undefined means a
  // client that does not participate in the check (kept working).
  const base = body?.stamp
  if (base !== undefined) {
    const current = await drafts.stamp(slug)
    if (current !== (base ?? null) && !await holdsPublishedText(slug, base, body?.publishedVersion)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This draft was saved by someone else since you opened it',
        data: { conflict: true, stamp: current },
      })
    }
  }

  if (loadedDigest !== undefined) {
    const stored = await currentDraftText(slug)
    const storedDigest = stored === null ? null : await textDigest(stored)
    if (storedDigest !== loadedDigest && !(loadedDigest === null && await holdsPublishedText(slug, null, body.publishedVersion))) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This draft was saved by someone else since you opened it',
        data: { conflict: true },
      })
    }
  }

  try {
    const prepared = prepareDeckWrite({ slug, raw })
    await writeDraftText(prepared.slug, prepared.raw, editor.login)
    // An explicit save is a moment worth keeping.
    await recordDraftSnapshot(prepared.slug, prepared.raw, { by: editor.login, force: true })
    return {
      ok: true,
      key: `draft:${prepared.slug}`,
      bytes: new TextEncoder().encode(prepared.raw).length,
      stamp: await drafts.stamp(prepared.slug),
      ...(loadedDigest === undefined ? {} : { draftDigest: loadedDigest as string | null }),
    }
  }
  catch (error) {
    if (error instanceof DeckWriteError)
      throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})

/**
 * A save that loaded no draft meets the draft an editor stored by opening the
 * deck: it passes while that draft is the published text and the version it
 * loaded is still the one served.
 */
async function holdsPublishedText(slug: string, base: unknown, loadedVersion: unknown): Promise<boolean> {
  if (base !== null || typeof loadedVersion !== 'number')
    return false
  const content = useDbContent()
  if (await content.publishedVersion(slug) !== loadedVersion)
    return false
  const published = await content.source.load(slug)
  return published !== null && await currentDraftText(slug) === published.raw
}
