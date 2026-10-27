// Tenant themes live in the same bucket as frozen bundles and media, under a
// `themes/` folder: `themes/<name>.css`, `themes/<name>/assets/...`,
// `themes/<name>/tokens.json` (the theme's runtime tokens and aliases) and one
// `themes/index.json` the push script rebuilds, which the server reads at boot.
// An instance with a `themesPrefix` reads and publishes them under
// `<prefix>/themes/`. Nuxt-free so the push script and the serving route share it.

import type { ThemeRegistry, ThemeTokens } from '@vignettes/core/theme'

/** `themes/<...>` in the bucket is `.themes/<...>` on the disk of a deployment without bucket credentials. */
export const THEMES_LOCAL_DIR = '.themes'

function segments(parts: string[]): string[] {
  return parts.flatMap(p => p.split('/').filter(Boolean))
}

/** Object key of a file published for a theme: `[<prefix>/]themes/<...parts>`. */
export function themeObjectKey(prefix: string, ...parts: string[]): string {
  return [...segments([prefix]), 'themes', ...segments(parts)].join('/')
}

/** The same file inside `THEMES_LOCAL_DIR`, as a path relative to the working directory. */
export function themeLocalPath(...parts: string[]): string {
  return [THEMES_LOCAL_DIR, ...segments(parts)].join('/')
}

/**
 * The versions of the theme packages a theme was compiled with, by package name:
 * `{ "@vignettes/theme-kit": "0.1.0+3f2a…" }` (see `themePackageVersions`).
 */
export type ThemePackageVersions = Record<string, string>

/** What one theme publishes about itself, next to its CSS and assets. */
export interface PublishedTheme {
  tokens: ThemeTokens
  aliases: string[]
  publishedAt: string
  compiledWith?: ThemePackageVersions
}

/** `themes/index.json`: the registry the runtime consumes, and what each theme was compiled with. */
export interface PublishedIndex extends ThemeRegistry {
  compiledWith?: Record<string, ThemePackageVersions>
}

/** Fold the published themes into the index the server reads. */
export function indexOf(published: PublishedTheme[]): PublishedIndex {
  const tokens: Record<string, ThemeTokens> = {}
  const aliases: Record<string, string> = {}
  const compiledWith: Record<string, ThemePackageVersions> = {}
  for (const theme of [...published].sort((a, b) => a.tokens.name.localeCompare(b.tokens.name))) {
    tokens[theme.tokens.name] = theme.tokens
    for (const alias of theme.aliases)
      aliases[alias] = theme.tokens.name
    if (theme.compiledWith)
      compiledWith[theme.tokens.name] = theme.compiledWith
  }
  return { tokens, aliases, compiledWith }
}

/** A published theme compiled with another version of a theme package than the instance's. */
export interface ThemeVersionGap {
  theme: string
  package: string
  /** Null when the theme was published without its versions. */
  compiled: string | null
  instance: string
}

/** The gaps between what the published themes were compiled with and the theme packages of the instance. */
export function themeVersionGaps(index: Partial<PublishedIndex>, instance: ThemePackageVersions): ThemeVersionGap[] {
  const gaps: ThemeVersionGap[] = []
  for (const theme of Object.keys(index.tokens ?? {}).sort()) {
    const compiled = index.compiledWith?.[theme]
    for (const [name, version] of Object.entries(instance)) {
      if (compiled?.[name] !== version)
        gaps.push({ theme, package: name, compiled: compiled?.[name] ?? null, instance: version })
    }
  }
  return gaps
}
