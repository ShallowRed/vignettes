import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'
import { resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import {
  frozenObjectKey,
  isFrozenS3Configured,
  makeFrozenS3Client,
} from '#shared/storage/frozen-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { gateDeckAccess } from '../../utils/access'
import { readArchivedStub } from '../../utils/presentations'
import { deckDirectory } from '../../utils/sources'

/**
 * Frozen-bundle static server. `/frozen/<bundle>/<...>` resolves the bundle to its
 * registry deck, ENFORCES `gateDeckAccess` (so private frozen decks aren't leaked),
 * then serves the asset from S3 (falling back to the local `.frozen/` dir when no
 * S3 creds are configured). Access is re-checked per asset; the bundle→gate
 * resolution is memoised briefly.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
}

interface GateInfo {
  slug: string
  status: ReturnType<typeof resolveDeckStatus>
  lifecycle: string
  storedHash?: string
}

const gateCache = new Map<string, { at: number, info: GateInfo | null }>()
const GATE_TTL_MS = 10_000

/** Map a bundle name (the /frozen/<bundle>/ segment) to its deck's gate inputs. */
async function resolveBundleGate(bundle: string): Promise<GateInfo | null> {
  const cached = gateCache.get(bundle)
  if (cached && Date.now() - cached.at < GATE_TTL_MS)
    return cached.info

  // frozenBundle defaults to the alias; fall back to a reverse scan otherwise.
  let entry = await deckDirectory.resolveAlias(bundle)
  if (!entry) {
    const all = await deckDirectory.list()
    entry = all.find(e => (e.frozenBundle ?? e.slug) === bundle) ?? null
  }

  let info: GateInfo | null = null
  if (entry) {
    const stub = await readArchivedStub(entry.slug)
    if (stub != null) {
      const meta = splitFrontmatter(stub).data as { accessPassword?: string }
      info = {
        slug: entry.slug,
        status: resolveDeckStatus(stub, entry.access),
        lifecycle: entry.lifecycle,
        storedHash: meta.accessPassword,
      }
    }
  }
  gateCache.set(bundle, { at: Date.now(), info })
  return info
}

/** Normalise the asset path within a bundle: directory-ish → index.html. */
function normaliseAssetPath(rest: string[]): string {
  const parts = rest.filter(Boolean)
  if (parts.length === 0)
    return 'index.html'
  const last = parts[parts.length - 1]
  if (!extname(last))
    return [...parts, 'index.html'].join('/')
  return parts.join('/')
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const segments = decodeURIComponent(raw).split('/').filter(Boolean)
  if (segments.length === 0)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const [bundle, ...rest] = segments
  // Defence in depth against path traversal.
  if (rest.includes('..'))
    throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  const gate = await resolveBundleGate(bundle)
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: `Unknown frozen bundle "${bundle}"` })

  // Gate BEFORE serving any byte (public passes; private needs cookie).
  await gateDeckAccess(event, {
    slug: gate.slug,
    status: gate.status,
    lifecycle: gate.lifecycle as never,
    storedHash: gate.storedHash,
  })

  const assetPath = normaliseAssetPath(rest)
  const isPublic = gate.status === 'public'
  const cacheControl = isPublic ? 'public, max-age=300' : 'private, no-store'

  // Read S3 config from process.env AT RUNTIME, not useRuntimeConfig: the
  // NUXT_FROZEN_S3_* names don't match Nuxt's override convention and would be
  // baked empty at build; `infisical run` injects them into process.env at runtime.
  const cfg = {
    endpoint: process.env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: process.env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: process.env.NUXT_FROZEN_S3_BUCKET || 'nuxt-slides-bucket',
    accessKeyId: process.env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }
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

  setResponseHeader(event, 'Content-Type', contentType || MIME[extname(assetPath).toLowerCase()] || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', cacheControl)
  setResponseHeader(event, 'X-Frozen-Source', source)
  return body
})
