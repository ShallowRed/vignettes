import type { PublishedIndex, ThemeVersionGap } from '#shared/storage/themes-s3'
import type { ThemeRegistry } from '@vignettes/core/theme'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { themeLocalPath, themeObjectKey, themeVersionGaps } from '#shared/storage/themes-s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { isKnownTheme, setDefaultTheme, setThemeRegistry } from '@vignettes/core/theme'
import { discoverThemes, registryOf } from '@vignettes/nuxt/build/theme-registry'
import { serverConfig } from './config'
import { makeFrozenS3Client } from './frozen-s3-client'

/**
 * Tenant themes at runtime. Two sources, merged: the content space on disk
 * (development, where `pnpm dev` also compiled them to `public/themes/`) and the
 * index the push script maintains beside the theme files, in the bucket or in
 * the local `.themes/` directory when a deployment has no bucket credentials.
 * `/themes/**` serves the files from whichever of the two this index came from.
 * The index records the theme packages each theme was compiled with; a theme
 * compiled with other versions than this build's is reported in the log, to
 * owners on a reload and to the editor, since it renders with another engine
 * stylesheet than the decks expect.
 * The result is applied to the shared registry on this side and handed to page
 * requests so the client gets the same one. Cached for a minute; owners can
 * force a reload.
 */
const TTL_MS = 60_000
let cache: { at: number, registry: Partial<ThemeRegistry> } | null = null
let inflight: Promise<Partial<ThemeRegistry>> | null = null
/** Themes whose stylesheet `/themes/**` serves, rather than `public/themes/`. */
let publishedNames: string[] = []
let versionGaps: ThemeVersionGap[] = []
let reportedGaps = ''

export function invalidateTenantThemes() {
  cache = null
}

/** The themes of the published index, known once `loadTenantThemes` has run. */
export function publishedThemeNames(): string[] {
  return publishedNames
}

/** The published themes compiled with other theme packages than this build's, known once `loadTenantThemes` has run. */
export function publishedThemeVersionGaps(): ThemeVersionGap[] {
  return versionGaps
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
  // A theme of the content space on disk compiles with this build, and wins over the published one.
  versionGaps = themeVersionGaps(remote, useRuntimeConfig().themePackages ?? {}).filter(gap => !local.tokens[gap.theme])
  reportVersionGaps(versionGaps)
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

/** Logs the gaps when they differ from the ones logged last, so a reload every minute stays quiet. */
function reportVersionGaps(gaps: ThemeVersionGap[]) {
  const lines = gaps.map(gap => `${gap.theme}: ${gap.package} ${gap.compiled ?? 'unknown'}, this instance ${gap.instance}`)
  const text = lines.join('\n  - ')
  if (text === reportedGaps)
    return
  reportedGaps = text
  if (lines.length)
    console.warn(`[themes] ${new Set(gaps.map(gap => gap.theme)).size} published theme(s) compiled with other theme packages than this instance; publish them again with theme:push:\n  - ${text}`)
}

async function readPublishedIndex(): Promise<Partial<PublishedIndex>> {
  const cfg = serverConfig().frozenS3
  if (!isFrozenS3Configured(cfg))
    return await readLocalIndex()
  const key = themeObjectKey(cfg.themesPrefix, 'index.json')
  try {
    const res = await makeFrozenS3Client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    const text = await res.Body!.transformToString()
    return JSON.parse(text) as PublishedIndex
  }
  catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
    if (status !== 404 && (err as { name?: string })?.name !== 'NoSuchKey')
      console.warn(`[themes] cannot read ${key} from the bucket: ${(err as Error).message}`)
    return {}
  }
}

async function readLocalIndex(): Promise<Partial<PublishedIndex>> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), themeLocalPath('index.json')), 'utf8')) as PublishedIndex
  }
  catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT')
      console.warn(`[themes] cannot read ${themeLocalPath('index.json')}: ${(err as Error).message}`)
    return {}
  }
}
