import type { ThemeRegistry } from '#shared/theme'
import process from 'node:process'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { THEMES_INDEX_KEY } from '#shared/storage/themes-s3'
import { setThemeRegistry } from '#shared/theme'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { discoverThemes, registryOf } from '../../scripts/lib/theme-registry.ts'

/**
 * Tenant themes at runtime. Two sources, merged: the content space on disk
 * (development, where `pnpm dev` also compiled them to `public/themes/`) and the
 * `themes/index.json` the push script maintains in the bucket (deployments,
 * where `/themes/**` streams the files from the same bucket). The result is
 * applied to the shared registry on this side and handed to page requests so the
 * client gets the same one. Cached for a minute; owners can force a reload.
 */
const TTL_MS = 60_000
let cache: { at: number, registry: Partial<ThemeRegistry> } | null = null
let inflight: Promise<Partial<ThemeRegistry>> | null = null

export function invalidateTenantThemes() {
  cache = null
}

export async function loadTenantThemes(): Promise<Partial<ThemeRegistry>> {
  if (cache && Date.now() - cache.at < TTL_MS)
    return cache.registry
  if (!inflight) {
    inflight = resolveTenantThemes().finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function resolveTenantThemes(): Promise<Partial<ThemeRegistry>> {
  const remote = await readPublishedIndex()
  const local = registryOf(discoverThemes(process.cwd()).filter(t => t.source === 'content'))
  const registry: ThemeRegistry = {
    tokens: { ...remote.tokens, ...local.tokens },
    aliases: { ...remote.aliases, ...local.aliases },
  }
  setThemeRegistry(registry)
  cache = { at: Date.now(), registry }
  return registry
}

async function readPublishedIndex(): Promise<Partial<ThemeRegistry>> {
  const cfg = frozenS3ConfigFromEnv(process.env)
  if (!isFrozenS3Configured(cfg))
    return {}
  try {
    const res = await makeFrozenS3Client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: THEMES_INDEX_KEY }))
    const text = await res.Body!.transformToString()
    return JSON.parse(text) as ThemeRegistry
  }
  catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    if (status !== 404 && (err as { name?: string })?.name !== 'NoSuchKey')
      console.warn(`[themes] cannot read ${THEMES_INDEX_KEY} from the bucket: ${(err as Error).message}`)
    return {}
  }
}
