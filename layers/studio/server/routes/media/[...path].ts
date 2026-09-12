import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'
import { isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { mediaObjectKey } from '#shared/storage/media-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'

/**
 * Public media server: `/media/<hash>.<ext>` streams an uploaded image from the
 * frozen bucket (falling back to the local `.media/` dir when no S3 creds). Keys
 * are content-hashed, so assets are immutable and cached forever. Public for now;
 * per-deck gating (private images) is a later step — the app-relative src means
 * we can add it here without rewriting stored decks.
 */

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const name = decodeURIComponent(raw).split('/').filter(Boolean).join('/')
  // Defence in depth against path traversal.
  if (!name || name.includes('..'))
    throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  const cfg = {
    endpoint: process.env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: process.env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: process.env.NUXT_FROZEN_S3_BUCKET || 'nuxt-slides-bucket',
    accessKeyId: process.env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }

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
    try {
      body = await readFile(join(process.cwd(), '.media', name))
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  const resolvedType = contentType || MIME[extname(name).toLowerCase()] || 'application/octet-stream'
  setResponseHeader(event, 'Content-Type', resolvedType)
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  // Uploaded files are user-supplied. Stop the browser from sniffing them into an
  // executable type, and sandbox SVG (which can embed inline script) so nothing
  // runs when one is opened as a top-level document. Inline <img> use is unaffected.
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  if (resolvedType === 'image/svg+xml')
    setResponseHeader(event, 'Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox')
  return body
})
