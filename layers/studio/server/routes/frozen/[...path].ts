import type { PublicationStatus } from '#shared/access'
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
import { gateDeckAccess } from '../../utils/access'
import { deckDirectory, useDeckMeta } from '../../utils/sources'

/**
 * Frozen-bundle static server. `/frozen/<bundle>/<...>` resolves the bundle to its
 * registry deck, ENFORCES `gateDeckAccess` (so private frozen decks aren't leaked),
 * then serves the asset from S3 (falling back to the local `.frozen/` dir when no
 * S3 creds are configured). Access is re-checked per asset, on the deck row as
 * it stands: only the bundle→slug mapping is memoised, since it costs a scan of
 * the directory and a deck keeps its bundle name. The status and the password of
 * the deck are read on every request, so closing a deck closes its bundle at
 * once.
 */

interface GateInfo {
  slug: string
  status: PublicationStatus
  lifecycle: string
  storedHash?: string
}

const slugOfBundle = new Map<string, string | null>()

/** Map a bundle name (the /frozen/<bundle>/ segment) to its deck's gate inputs. */
async function resolveBundleGate(bundle: string): Promise<GateInfo | null> {
  if (!slugOfBundle.has(bundle)) {
    // frozenBundle defaults to the alias; fall back to a reverse scan otherwise.
    let entry = await deckDirectory.resolveAlias(bundle)
    if (!entry) {
      const all = await deckDirectory.list()
      entry = all.find(e => (e.frozenBundle ?? e.slug) === bundle) ?? null
    }
    slugOfBundle.set(bundle, entry?.slug ?? null)
  }

  const slug = slugOfBundle.get(bundle)!
  if (!slug)
    return null

  const meta = await useDeckMeta().get(slug)
  if (!meta?.managed)
    return null

  return {
    slug,
    status: meta.status,
    lifecycle: meta.lifecycle,
    storedHash: meta.accessPasswordHash ?? undefined,
  }
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

  const gate = await resolveBundleGate(bundle)
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const assetPath = normaliseAssetPath(rest)
  // Gate BEFORE serving any byte (public passes; private needs cookie). Only the
  // page of the bundle answers `?password=`: on its stylesheets and its images
  // that parameter would say which files exist and mint the cookie from them.
  await gateDeckAccess(event, {
    slug: gate.slug,
    status: gate.status,
    lifecycle: gate.lifecycle as never,
    storedHash: gate.storedHash,
  }, assetPath.endsWith('index.html'))

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
