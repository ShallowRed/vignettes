import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { contentTypeOf } from '#shared/storage/content-types'
import { isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { themeLocalPath, themeObjectKey } from '#shared/storage/themes-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { serverConfig } from '../../utils/config'
import { makeFrozenS3Client } from '../../utils/frozen-s3-client'

/**
 * Tenant theme files: `/themes/<name>.css` and `/themes/<name>/assets/...`
 * streamed from the bucket, or read from the local `.themes/` directory on a
 * deployment with no bucket credentials. The application's own themes are
 * static files under `public/themes/`, served before this route; only names
 * absent there reach it.
 * Theme files are public by nature (a stylesheet loads without a session).
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const parts = decodeURIComponent(raw).split('/').filter(Boolean)
  if (parts.length === 0 || parts.includes('..'))
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const cfg = serverConfig().frozenS3
  let body: Buffer
  let contentType: string | undefined
  if (isFrozenS3Configured(cfg)) {
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
  }
  else {
    try {
      body = await readFile(join(process.cwd(), themeLocalPath(...parts)))
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Theme not found' })
    }
  }

  setResponseHeader(event, 'Content-Type', contentType || contentTypeOf(parts[parts.length - 1]!))
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return body
})
