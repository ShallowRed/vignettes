// Tenant themes live in the same bucket as frozen bundles and media, under a
// `themes/` prefix: `themes/<name>.css`, `themes/<name>/assets/...`,
// `themes/<name>/tokens.json` (the theme's runtime tokens and aliases) and one
// `themes/index.json` the push script rebuilds, which the server reads at boot.
// Nuxt-free so the push script and the serving route share it.

import type { ThemeRegistry, ThemeTokens } from '@vignettes/core/theme'

export const THEMES_INDEX_KEY = 'themes/index.json'

/** `themes/<...>` in the bucket is `.themes/<...>` on the disk of a deployment without bucket credentials. */
export const THEMES_LOCAL_DIR = '.themes'

/** Object key of a file published for a theme: `themes/<...parts>`. */
export function themeObjectKey(...parts: string[]): string {
  return ['themes', ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

/** The same file inside `THEMES_LOCAL_DIR`, as a path relative to the working directory. */
export function themeLocalPath(...parts: string[]): string {
  return [THEMES_LOCAL_DIR, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

/** What one theme publishes about itself, next to its CSS and assets. */
export interface PublishedTheme {
  tokens: ThemeTokens
  aliases: string[]
  publishedAt: string
}

export function tokensKeyOf(name: string): string {
  return themeObjectKey(name, 'tokens.json')
}

/** Fold the published themes into the registry shape the runtime consumes. */
export function indexOf(published: PublishedTheme[]): ThemeRegistry {
  const tokens: Record<string, ThemeTokens> = {}
  const aliases: Record<string, string> = {}
  for (const theme of [...published].sort((a, b) => a.tokens.name.localeCompare(b.tokens.name))) {
    tokens[theme.tokens.name] = theme.tokens
    for (const alias of theme.aliases)
      aliases[alias] = theme.tokens.name
  }
  return { tokens, aliases }
}

export const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}
