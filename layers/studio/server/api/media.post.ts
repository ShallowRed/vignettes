import type { MediaRefusal } from '@vignettes/core/media'
import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { acceptedImageType, IMAGE_FORMAT_NAMES, imageExtFor, MAX_MEDIA_BYTES, MAX_MEDIA_MEGABYTES, mediaName } from '@vignettes/core/media'
import { assertCanEditDeck } from '../utils/access'
import { getActorRole } from '../utils/actor'
import { storeMedia } from '../utils/media-store'
import { useDeckMeta, useMediaIndex } from '../utils/sources'

/**
 * POST /api/media?deck=<slug> — upload an image. Allowed to privileged roles, and
 * to anyone who may edit the named deck (an `editor` grant): the editor offers
 * paste/drop to every writer, so the upload must follow the same right or a
 * collaborator hits a 403 mid-edit. The file is
 * content-hashed and stored in the frozen bucket under `media/` (falling back to
 * a local `.media/` dir when no S3 creds are configured, e.g. in dev). Returns an
 * app-relative `/media/<hash>.<ext>` src so the stored markdown never hardcodes a
 * bucket URL. The bytes of the file decide its type.
 * The upload records the deck in the media index, which `/media/**` reads to
 * decide who may see the image. A refusal names its cause in its message
 * and, for the editor to word it in the interface language, in `data.reason`.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event).deck
  const deck = typeof query === 'string' && isDeckSlug(query) ? query : undefined
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    if (!deck) {
      throw createError({
        statusCode: role === 'anonymous' ? 401 : 403,
        statusMessage: 'Owner or editor role required, or an editor grant on the deck being edited',
      })
    }
    await assertCanEditDeck(event, deck)
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.filename)
  if (!file || !file.data?.length)
    throw createError({ statusCode: 400, statusMessage: 'Expected a `file` upload' })

  const mime = file.type || ''
  if (!imageExtFor(mime)) {
    throw createError({
      statusCode: 415,
      statusMessage: `Unsupported image type ${mime || '(none)'}: the accepted formats are ${IMAGE_FORMAT_NAMES.join(', ')}`,
      data: { reason: 'type' satisfies MediaRefusal },
    })
  }
  if (file.data.length > MAX_MEDIA_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `The image weighs more than the ${MAX_MEDIA_MEGABYTES} MB limit`,
      data: { reason: 'size' satisfies MediaRefusal },
    })
  }
  const type = acceptedImageType(mime, file.data)
  if (!type) {
    throw createError({
      statusCode: 415,
      statusMessage: `The content of the file does not match its declared type ${mime}`,
      data: { reason: 'content' satisfies MediaRefusal },
    })
  }

  const name = await mediaName(file.data, type)
  try {
    await storeMedia(name, file.data, type)
  }
  catch (cause) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The image storage did not accept the file',
      data: { reason: 'storage' satisfies MediaRefusal },
      cause,
    })
  }

  // The draft that references the image is saved a few seconds later.
  if (deck && await useDeckMeta().existsIncludingTrashed(deck))
    await useMediaIndex().record(deck, [name])

  return { src: `/media/${name}` }
})
