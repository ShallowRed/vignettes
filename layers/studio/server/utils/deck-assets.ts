import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { CONTENT_TYPES } from '#shared/storage/themes-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { deckAssetKey, deckAssetLocalPath } from '@vignettes/core/deck-assets'

/**
 * Serve a deck asset of the content space (`presentations/assets/<prefix>/...`,
 * referenced by decks as `/<prefix>/...`): from the bucket on a deployment,
 * from the content directory on disk otherwise. Files the application ships
 * under `public/` with the same prefix are static and never reach this.
 */
export async function serveDeckAsset(event: H3Event, prefix: string): Promise<Buffer> {
  const raw = getRouterParam(event, 'path') || ''
  const parts = decodeURIComponent(raw).split('/').filter(Boolean)
  if (parts.length === 0 || parts.includes('..'))
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const cfg = frozenS3ConfigFromEnv(process.env)
  let body: Buffer
  let contentType: string | undefined
  if (isFrozenS3Configured(cfg)) {
    try {
      const res = await makeFrozenS3Client(cfg).send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: deckAssetKey(prefix, ...parts) }),
      )
      body = Buffer.from(await res.Body!.transformToByteArray())
      contentType = res.ContentType
    }
    catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (status === 404 || (err as { name?: string })?.name === 'NoSuchKey')
        throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
      throw err
    }
  }
  else {
    try {
      body = await readFile(join(process.cwd(), deckAssetLocalPath(process.env.NUXT_CONTENT_DIR, prefix, ...parts)))
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }
  }

  const ext = extname(parts[parts.length - 1]).toLowerCase()
  setResponseHeader(event, 'Content-Type', contentType || CONTENT_TYPES[ext] || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return body
}
