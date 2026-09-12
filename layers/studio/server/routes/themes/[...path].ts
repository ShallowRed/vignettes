import { Buffer } from 'node:buffer'
import { extname } from 'node:path'
import process from 'node:process'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { CONTENT_TYPES, themeObjectKey } from '#shared/storage/themes-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'

/**
 * Tenant theme files: `/themes/<name>.css` and `/themes/<name>/assets/...`
 * streamed from the bucket. The application's own themes are static files under
 * `public/themes/`, served before this route; only names absent there reach it.
 * Theme files are public by nature (a stylesheet loads without a session).
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const parts = decodeURIComponent(raw).split('/').filter(Boolean)
  if (parts.length === 0 || parts.includes('..'))
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const cfg = frozenS3ConfigFromEnv(process.env)
  if (!isFrozenS3Configured(cfg))
    throw createError({ statusCode: 404, statusMessage: 'Theme not found' })

  let body: Buffer
  let contentType: string | undefined
  try {
    const res = await makeFrozenS3Client(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: themeObjectKey(...parts) }),
    )
    body = Buffer.from(await res.Body!.transformToByteArray())
    contentType = res.ContentType
  }
  catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    if (status === 404 || (err as { name?: string })?.name === 'NoSuchKey')
      throw createError({ statusCode: 404, statusMessage: 'Theme not found' })
    throw err
  }

  const ext = extname(parts[parts.length - 1]).toLowerCase()
  setResponseHeader(event, 'Content-Type', contentType || CONTENT_TYPES[ext] || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return body
})
