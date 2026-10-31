import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'
import { contentTypeOf } from '#shared/storage/content-types'
import {
  frozenObjectKey,
  isFrozenS3Configured,
} from '#shared/storage/frozen-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { isDeckSlug } from '@vignettes/core/deck'
import { gateDeckAccess, gateOptionsOf } from '../../utils/access'
import { serverConfig } from '../../utils/config'
import { makeFrozenS3Client } from '../../utils/frozen-s3-client'
import { fileUnder, requestPathSegments } from '../../utils/request-path'
import { deckOfBundleName } from '../../utils/sources'

/**
 * Frozen-bundle static server. `/frozen/<name>/<...>` resolves the name to its
 * deck, gates the request on that deck, then serves the asset of the deck's own
 * bundle from S3, or from the local `.frozen/` directory when no S3 credentials
 * are configured.
 * The bundle is resolved and the deck is read on every request: both are
 * lookups in the local database, and a memo here once left a closed deck open
 * and an undeclared bundle unreachable.
 */

/** Normalise the asset path within a bundle: directory-ish → index.html. */
function normaliseAssetPath(parts: string[]): string[] {
  if (parts.length === 0)
    return ['index.html']
  if (!extname(parts[parts.length - 1]!))
    return [...parts, 'index.html']
  return parts
}

export default defineEventHandler(async (event) => {
  const [name, ...rest] = requestPathSegments(event) as [string, ...string[]]
  const deck = isDeckSlug(name) ? await deckOfBundleName(name) : null
  // The bundle read is the one of the deck the gate decides on, whatever name the URL gives.
  const bundle = deck ? deck.frozenBundle ?? deck.slug : null
  const gate = deck && bundle && isDeckSlug(bundle) ? await gateOptionsOf(deck.slug) : null
  if (!gate || !bundle)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const assetParts = normaliseAssetPath(rest)
  const assetPath = assetParts.join('/')
  // The gate comes before any byte is read. A visitor unlocks a protected deck
  // through `/p/<alias>`, and arrives here carrying the cookie.
  await gateDeckAccess(event, gate)

  const isPublic = gate.status === 'public'
  const cacheControl = isPublic ? 'public, max-age=300' : 'private, no-store'

  const cfg = serverConfig().frozenS3
  let body: Buffer
  let contentType: string | undefined
  let source: 's3' | 'local'

  if (isFrozenS3Configured(cfg)) {
    source = 's3'
    const s3 = makeFrozenS3Client(cfg)
    try {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: frozenObjectKey(bundle, assetPath) }),
      )
      const bytes = await res.Body!.transformToByteArray()
      body = Buffer.from(bytes)
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
    source = 'local'
    const file = fileUnder(join(process.cwd(), '.frozen', bundle), assetParts)
    try {
      body = await readFile(file)
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }
  }

  setResponseHeader(event, 'Content-Type', contentType || contentTypeOf(assetPath))
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', cacheControl)
  setResponseHeader(event, 'X-Frozen-Source', source)
  return body
})
