import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { imageExtFor, MAX_MEDIA_BYTES, mediaObjectKey } from '#shared/storage/media-s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { assertCanEditDeck } from '../utils/access'
import { getActorRole } from '../utils/actor'

/**
 * POST /api/media?deck=<slug> — upload an image. Allowed to privileged roles, and
 * to anyone who may edit the named deck (an `editor` grant): the editor offers
 * paste/drop to every writer, so the upload must follow the same right or a
 * collaborator hits a 403 mid-edit. The file is
 * content-hashed and stored in the frozen bucket under `media/` (falling back to
 * a local `.media/` dir when no S3 creds are configured, e.g. in dev). Returns an
 * app-relative `/media/<hash>.<ext>` src so the stored markdown never hardcodes a
 * bucket URL (lets us later gate serving without touching deck content).
 */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    const deck = getQuery(event).deck
    if (typeof deck !== 'string' || !isDeckSlug(deck)) {
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
  const ext = imageExtFor(mime)
  if (!ext)
    throw createError({ statusCode: 415, statusMessage: 'Unsupported image type' })
  if (file.data.length > MAX_MEDIA_BYTES)
    throw createError({ statusCode: 413, statusMessage: 'Image exceeds 10 MB' })

  const hash = createHash('sha256').update(file.data).digest('hex').slice(0, 32)
  const name = `${hash}.${ext}`

  // Env read at runtime (NUXT_FROZEN_S3_* don't fit Nuxt's override convention).
  const cfg = {
    endpoint: process.env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: process.env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: process.env.NUXT_FROZEN_S3_BUCKET || 'nuxt-slides-bucket',
    accessKeyId: process.env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }

  if (isFrozenS3Configured(cfg)) {
    const s3 = makeFrozenS3Client(cfg)
    await s3.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: mediaObjectKey(name),
      Body: file.data,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
  }
  else {
    const dir = join(process.cwd(), '.media')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, name), file.data)
  }

  return { src: `/media/${name}` }
})
