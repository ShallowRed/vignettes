import type { ThemeRegistry } from '@vignettes/core/theme'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { frozenS3ConfigFromEnv, isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { themeLocalPath, THEMES_INDEX_KEY } from '#shared/storage/themes-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { isKnownTheme, setDefaultTheme, setThemeRegistry } from '@vignettes/core/theme'
import { discoverThemes, registryOf } from '@vignettes/nuxt/build/theme-registry'
import { makeFrozenS3Client } from './frozen-s3-client'

/**
 * Tenant themes at runtime. Two sources, merged: the content space on disk
 * (development, where `pnpm dev` also compiled them to `public/themes/`) and the
 * index the push script maintains beside the theme files, in the bucket or in
 * the local `.themes/` directory when a deployment has no bucket credentials.
 * `/themes/**` serves the files from whichever of the two this index came from.
 * The result is applied to the shared registry on this side and handed to page
 * requests so the client gets the same one. Cached for a minute; owners can
 * force a reload.
 */
const TTL_MS = 60_000
let cache: { at: number, registry: Partial<ThemeRegistry> } | null = null
let inflight: Promise<Partial<ThemeRegistry>> | null = null
/** Themes whose stylesheet `/themes/**` serves, rather than `public/themes/`. */
let publishedNames: string[] = []

export function invalidateTenantThemes() {
  cache = null
}

/** The themes of the published index, known once `loadTenantThemes` has run. */
export function publishedThemeNames(): string[] {
  return publishedNames
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
  publishedNames = Object.keys(remote.tokens ?? {})
  const local = registryOf(discoverThemes(process.cwd()).filter(t => t.source === 'content'))
  const registry: ThemeRegistry = {
    tokens: { ...remote.tokens, ...local.tokens },
    aliases: { ...remote.aliases, ...local.aliases },
  }
  setThemeRegistry(registry)
  applyDefaultTheme()
  cache = { at: Date.now(), registry }
  return registry
}

/** Applies `runtimeConfig.public.defaultTheme` once the registry can tell whether the name is known. */
function applyDefaultTheme() {
  const configured = useRuntimeConfig().public.defaultTheme as string | undefined
  const unknown = Boolean(configured) && !isKnownTheme(configured!)
  const applied = setDefaultTheme(unknown ? null : configured)
  if (unknown)
    console.warn(`[themes] default theme "${configured}" is not a known theme; decks without a theme fall back to "${applied}"`)
}

async function readPublishedIndex(): Promise<Partial<ThemeRegistry>> {
  const cfg = frozenS3ConfigFromEnv(process.env)
  if (!isFrozenS3Configured(cfg))
    return await readLocalIndex()
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

async function readLocalIndex(): Promise<Partial<ThemeRegistry>> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), themeLocalPath('index.json')), 'utf8')) as ThemeRegistry
  }
  catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT')
      console.warn(`[themes] cannot read ${themeLocalPath('index.json')}: ${(err as Error).message}`)
    return {}
  }
}
