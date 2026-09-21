import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'
import { contentTypeOf } from '#shared/storage/content-types'
import {
  frozenObjectKey,
  frozenS3ConfigFromEnv,
  isFrozenS3Configured,
  makeFrozenS3Client,
} from '#shared/storage/frozen-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { gateDeckAccess, gateOptionsOf } from '../../utils/access'
import { deckDirectory } from '../../utils/sources'

/**
 * Frozen-bundle static server. `/frozen/<bundle>/<...>` resolves the bundle to
 * its deck, gates the request on that deck, then serves the asset from S3, or
 * from the local `.frozen/` directory when no S3 credentials are configured.
 * The bundle is resolved and the deck is read on every request: both are
 * lookups in the local database, and a memo here once left a closed deck open
 * and an undeclared bundle unreachable.
 */

/** The slug of the deck a bundle name (the `/frozen/<bundle>/` segment) belongs to. */
async function slugOfBundle(bundle: string): Promise<string | null> {
  // `frozenBundle` defaults to the alias, and to the slug when the deck has neither.
  const byAlias = await deckDirectory.resolveAlias(bundle)
  if (byAlias)
    return byAlias.slug
  const all = await deckDirectory.list()
  return all.find(entry => (entry.frozenBundle ?? entry.slug) === bundle)?.slug ?? null
}

/** Normalise the asset path within a bundle: directory-ish → index.html. */
function normaliseAssetPath(rest: string[]): string {
  const parts = rest.filter(Boolean)
  if (parts.length === 0)
    return 'index.html'
  const last = parts[parts.length - 1]!
  if (!extname(last))
    return [...parts, 'index.html'].join('/')
  return parts.join('/')
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const segments = decodeURIComponent(raw).split('/').filter(Boolean)
  if (segments.length === 0)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const [bundle, ...rest] = segments as [string, ...string[]]
  // Defence in depth against path traversal.
  if (rest.includes('..'))
    throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  const slug = await slugOfBundle(bundle)
  const gate = slug ? await gateOptionsOf(slug) : null
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const assetPath = normaliseAssetPath(rest)
  // The gate comes before any byte is read. A visitor unlocks a protected deck
  // through `/p/<alias>`, and arrives here carrying the cookie.
  await gateDeckAccess(event, gate)

  const isPublic = gate.status === 'public'
  const cacheControl = isPublic ? 'public, max-age=300' : 'private, no-store'

  // Read S3 config from process.env AT RUNTIME, not useRuntimeConfig: the
  // NUXT_FROZEN_S3_* names don't match Nuxt's override convention and would be
  // baked empty at build; `infisical run` injects them into process.env at runtime.
  const cfg = frozenS3ConfigFromEnv(process.env)
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
    try {
      body = await readFile(join(process.cwd(), '.frozen', bundle, assetPath))
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
