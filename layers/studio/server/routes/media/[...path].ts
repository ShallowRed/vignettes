import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { contentTypeOf } from '#shared/storage/content-types'
import { isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { mediaObjectKey } from '#shared/storage/media-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { decideMediaAccess } from '../../utils/access'
import { serverConfig } from '../../utils/config'
import { makeFrozenS3Client } from '../../utils/frozen-s3-client'
import { fileUnder, requestPathSegments } from '../../utils/request-path'

/**
 * Media server: `/media/<hash>.<ext>` streams an uploaded image from the frozen
 * bucket (falling back to the local `.media/` dir when no S3 creds). Keys are
 * content-hashed, so assets are immutable. An image is served with the
 * visibility of the decks that reference it (`decideMediaAccess`), and a shared
 * cache may keep it only when all of them are public.
 */

export default defineEventHandler(async (event) => {
  const segments = requestPathSegments(event)
  const name = segments.join('/')

  // 404 rather than 403, which would tell which hashes exist.
  const access = await decideMediaAccess(event, name)
  if (!access.allowed)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const cfg = serverConfig().frozenS3

  let body: Buffer
  let contentType: string | undefined

  if (isFrozenS3Configured(cfg)) {
    const s3 = makeFrozenS3Client(cfg)
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: mediaObjectKey(name) }))
      body = Buffer.from(await res.Body!.transformToByteArray())
      contentType = res.ContentType
    }
    catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (status === 404 || (err as { name?: string })?.name === 'NoSuchKey')
        throw createError({ statusCode: 404, statusMessage: 'Not found' })
      throw err
    }
  }
  else {
    const file = fileUnder(join(process.cwd(), '.media'), segments)
    try {
      body = await readFile(file)
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  const resolvedType = contentType || contentTypeOf(name)
  setResponseHeader(event, 'Content-Type', resolvedType)
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', access.public ? 'public, max-age=31536000, immutable' : 'private, max-age=31536000, immutable')
  // Uploaded files are user-supplied; the route rule of every response stops the
  // browser from sniffing them into an executable type. An SVG can embed inline
  // script: it is sandboxed, and downloaded when opened as a top-level document.
  // Inline <img> use is unaffected.
  if (resolvedType === 'image/svg+xml') {
    setResponseHeader(event, 'Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox')
    setResponseHeader(event, 'Content-Disposition', 'attachment')
  }
  return body
})
