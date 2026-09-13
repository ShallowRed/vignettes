/**
 * The files a frozen bundle must carry beside its HTML. A bundle is served by a
 * plain file server: everything the app would resolve through a route (the deck
 * assets of the content space) or through another theme's stylesheet has to be
 * copied in, and everything else left out.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { DECK_ASSET_PREFIXES, deckAssetLocalPath } from '@vignettes/core/deck-assets'

/**
 * Copy `public/` into `outDir`, keeping only the frozen deck's theme and what
 * that theme's stylesheet references (a brand loads the base theme's fonts).
 * The other themes would otherwise ship with every bundle, their brand
 * backgrounds included.
 */
export function buildReducedPublic(root: string, outDir: string, theme?: string): string[] {
  const publicDir = join(root, 'public')
  mkdirSync(outDir, { recursive: true })
  const kept: string[] = []
  for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
    if (entry.name === 'themes')
      continue
    cpSync(join(publicDir, entry.name), join(outDir, entry.name), { recursive: true })
    kept.push(entry.name)
  }

  const themesDir = join(publicDir, 'themes')
  if (theme && !existsSync(join(themesDir, `${theme}.css`))) {
    throw new Error(
      `theme "${theme}" has no compiled stylesheet in ${themesDir}. `
      + 'The bundle would carry an unstyled deck: compile the themes first.',
    )
  }
  if (!existsSync(themesDir))
    return kept

  const wanted = new Set(theme ? [`${theme}.css`, theme] : [])
  if (theme) {
    // Directories the theme's own CSS points into, e.g. the DSFR base fonts.
    const css = join(themesDir, `${theme}.css`)
    for (const [, name] of readFileSync(css, 'utf8').matchAll(/url\(["']?\/themes\/([\w-]+)\//g))
      wanted.add(name)
  }

  mkdirSync(join(outDir, 'themes'), { recursive: true })
  for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
    if (theme && !wanted.has(entry.name))
      continue
    cpSync(join(themesDir, entry.name), join(outDir, 'themes', entry.name), { recursive: true })
    kept.push(`themes/${entry.name}`)
  }
  return kept
}

/**
 * Make the root-absolute `url()` of every stylesheet in the bundle relative to
 * its own location. A bundle is served from wherever it is dropped — the origin
 * root, `/frozen/<name>/`, a file share — so nothing inside may assume a base.
 */
export function rebaseCssUrls(bundleDir: string): number {
  let rewritten = 0
  for (const file of cssFiles(bundleDir)) {
    const depth = relative(bundleDir, dirname(file)).split('/').filter(Boolean).length
    const prefix = depth === 0 ? './' : '../'.repeat(depth)
    const css = readFileSync(file, 'utf8')
    const next = css.replace(/url\((["']?)\/(?!\/)/g, `url($1${prefix}`)
    if (next !== css) {
      writeFileSync(file, next)
      rewritten++
    }
  }
  return rewritten
}

function cssFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? cssFiles(join(dir, entry.name))
      : entry.name.endsWith('.css') ? [join(dir, entry.name)] : [],
  )
}

/** Root-absolute deck asset URLs a markdown document references, deduplicated. */
export function referencedDeckAssets(markdown: string): string[] {
  const pattern = new RegExp(`/(?:${DECK_ASSET_PREFIXES.join('|')})/[\\w./-]+`, 'g')
  return [...new Set(markdown.match(pattern) ?? [])]
}

/**
 * Copy the deck assets a document references from the content space into the
 * bundle, at the same path. Files the application ships under `public/` are
 * already there; a missing file is reported rather than failing the freeze.
 */
export function copyDeckAssets(root: string, markdown: string, outDir: string, contentDirName?: string): { copied: string[], missing: string[] } {
  const copied: string[] = []
  const missing: string[] = []
  for (const url of referencedDeckAssets(markdown)) {
    const target = join(outDir, url.replace(/^\//, ''))
    if (existsSync(target)) {
      copied.push(url)
      continue
    }
    const [, prefix, ...parts] = url.split('/')
    const source = join(root, deckAssetLocalPath(contentDirName, prefix, ...parts))
    if (!existsSync(source)) {
      missing.push(url)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target)
    copied.push(url)
  }
  return { copied, missing }
}
