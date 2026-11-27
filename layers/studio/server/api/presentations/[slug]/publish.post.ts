import { DeckWriteError } from '@vignettes/core/deck'
import { isDigest, textDigest } from '@vignettes/core/digest'
import { assertCanEditDeck } from '../../../utils/access'
import { announcePublication, currentDraftText } from '../../../utils/collab'
import { useDbContent } from '../../../utils/sources'

/**
 * Publish a deck: derive the markdown from its draft and persist it as a new
 * immutable version (the explicit act separating "saved" from "visible").
 * POST /api/presentations/:slug/publish   body: { digest? }
 *
 * A client that knows the text it asks to publish sends its `digest`
 * (`textDigest`): the publication is refused (409, `data.conflict`) when the
 * draft, the live room included, holds another text, and the answer repeats the
 * digest it compared.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const editor = await assertCanEditDeck(event, slug, { contentToken: true })

  const digest = (await readBody(event))?.digest
  if (digest !== undefined && !isDigest(digest)) {
    throw createError({ statusCode: 400, statusMessage: 'digest must be the SHA-256 of the text, in lowercase hexadecimal' })
  }

  const draft = await currentDraftText(slug)

  if (!draft) {
    throw createError({ statusCode: 404, statusMessage: 'No draft to publish' })
  }

  // The version written is `draft`, the text whose digest was compared: a
  // keystroke that reaches the room meanwhile stays in the draft, and the next
  // publication carries it.
  if (digest !== undefined && await textDigest(draft) !== digest) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The draft differs from the text this publication was asked for',
      data: { conflict: true },
    })
  }

  try {
    const result = await useDbContent().writer.save({ slug, raw: draft, actor: editor.login ?? 'unknown' })
    announcePublication(slug)
    return { ok: true, ...result, ...(digest === undefined ? {} : { digest }) }
  }
  catch (error) {
    if (error instanceof DeckWriteError)
      throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})
