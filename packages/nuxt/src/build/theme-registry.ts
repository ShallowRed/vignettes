/**
 * Theme discovery from manifests. A theme is a directory holding a `theme.json`
 * next to its SCSS entry and its `assets/`. Two roots are scanned: `themes/` of
 * the application and `themes/` of the content space (`NUXT_CONTENT_DIR`,
 * `presentations/` by default), so a tenant ships its brands next to its decks.
 *
 * Pure filesystem reads, no Nuxt import: shared by the build scripts, the dev
 * watcher plugin, the token generator and the server's runtime loader.
 */
import type { ThemePreview, ThemeRegistry, ThemeTokens } from '@vignettes/core/theme'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export interface ThemeAssetCopy {
  /** Source directory, resolved from the project root (a node_modules path works). */
  from: string
  /** Destination under `<out>/<name>/`. */
  to: string
  /** Regular expression a file name must match to be copied. */
  match?: string
}

export interface ThemeManifest {
  /** Must equal the directory name; used in `theme:` frontmatter and `/themes/<name>.css`. */
  name: string
  /** Theme this one builds on, for documentation and a build-time check. */
  extends?: string
  /** Other names that resolve to this theme, e.g. a name already used in a tenant's decks. */
  aliases?: string[]
  lang?: string
  parser?: 'heading' | 'separator'
  reveal?: Record<string, unknown>
  /** Code theme of the deck blocks by default: a name of `CODE_THEMES`, or its properties. */
  code?: unknown
  /** Background images per heading level, relative to the theme directory or absolute URLs. */
  backgrounds?: Partial<Record<'h1' | 'h2' | 'h3' | 'default', string>>
  /**
   * The title slide as a catalog card draws it. `fonts` names a sass module
   * declaring the font faces, compiled to `<name>/preview-fonts.css`.
   */
  preview?: Omit<ThemePreview, 'fontsStylesheet'> & { fonts?: string }
  /** SCSS entry, `<name>.scss` by default. */
  entry?: string
  /** Extra directories copied next to the theme's own `assets/`. */
  assets?: ThemeAssetCopy[]
}

export interface DiscoveredTheme {
  name: string
  /** Absolute theme directory. */
  dir: string
  /** Absolute SCSS entry. */
  entry: string
  manifest: ThemeManifest
  source: 'app' | 'content'
}

export function contentDir(root: string): string {
  const dir = process.env.NUXT_CONTENT_DIR || 'presentations'
  return isAbsolute(dir) ? dir : resolve(root, dir)
}

export function themeRoots(root: string): { dir: string, source: DiscoveredTheme['source'] }[] {
  return [
    { dir: join(root, 'themes'), source: 'app' },
    { dir: join(contentDir(root), 'themes'), source: 'content' },
  ]
}

export function discoverThemes(root: string): DiscoveredTheme[] {
  const found = new Map<string, DiscoveredTheme>()
  for (const { dir, source } of themeRoots(root)) {
    if (!existsSync(dir))
      continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const themeDir = join(dir, entry.name)
      const manifestPath = join(themeDir, 'theme.json')
      if (!existsSync(manifestPath))
        continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ThemeManifest
      if (manifest.name !== entry.name)
        throw new Error(`${manifestPath}: "name" is "${manifest.name}", the directory is "${entry.name}"`)
      const previous = found.get(manifest.name)
      if (previous)
        throw new Error(`theme "${manifest.name}" is declared twice: ${previous.dir} and ${themeDir}`)
      const scss = manifest.entry ?? `${manifest.name}.scss`
      found.set(manifest.name, { name: manifest.name, dir: themeDir, entry: join(themeDir, scss), manifest, source })
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The font faces of a theme's preview, next to its assets. */
export const PREVIEW_FONTS_FILE = 'preview-fonts.css'

/** Public URL of a theme-relative path (`assets/x.png` under `themes/brand/` serves at `/themes/brand/assets/x.png`). */
export function themeAssetUrl(name: string, path: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('/'))
    return path
  return `/themes/${name}/${path.replace(/^\.\//, '')}`
}

/** The runtime tokens a manifest declares, background paths turned into public URLs. */
export function manifestTokens(manifest: ThemeManifest): ThemeTokens {
  const { name, lang, parser, reveal, backgrounds, preview, code } = manifest
  const tokens: ThemeTokens = { name }
  if (lang)
    tokens.lang = lang
  if (parser)
    tokens.parser = parser
  if (code)
    tokens.code = code
  if (backgrounds) {
    tokens.backgrounds = Object.fromEntries(
      Object.entries(backgrounds).map(([level, path]) => [level, themeAssetUrl(name, path)]),
    )
  }
  if (reveal)
    tokens.reveal = reveal as ThemeTokens['reveal']
  if (preview) {
    const { fonts, ...rest } = preview
    tokens.preview = fonts ? { ...rest, fontsStylesheet: themeAssetUrl(name, PREVIEW_FONTS_FILE) } : rest
  }
  return tokens
}

/** Alias map, tenant themes (content) taking precedence over application ones. */
export function themeAliases(themes: DiscoveredTheme[]): { aliases: Record<string, string>, warnings: string[] } {
  const aliases: Record<string, string> = {}
  const warnings: string[] = []
  const ordered = [...themes].sort((a, b) => (a.source === b.source ? 0 : a.source === 'content' ? -1 : 1))
  for (const theme of ordered) {
    for (const alias of theme.manifest.aliases ?? []) {
      if (aliases[alias]) {
        warnings.push(`alias "${alias}" claimed by both ${aliases[alias]} and ${theme.name}, keeping ${aliases[alias]}`)
        continue
      }
      if (themes.some(t => t.name === alias))
        warnings.push(`alias "${alias}" of ${theme.name} shadows the theme named "${alias}"`)
      aliases[alias] = theme.name
    }
  }
  return { aliases, warnings }
}

/** Registry (tokens + aliases) of a set of discovered themes. */
export function registryOf(themes: DiscoveredTheme[]): ThemeRegistry {
  return {
    tokens: Object.fromEntries(themes.map(t => [t.name, manifestTokens(t.manifest)])),
    aliases: themeAliases(themes).aliases,
  }
}

export function checkExtends(themes: DiscoveredTheme[]): string[] {
  const names = new Set(themes.map(t => t.name))
  return themes
    .filter(t => t.manifest.extends && !names.has(t.manifest.extends))
    .map(t => `${t.name} extends "${t.manifest.extends}", which is not a discovered theme`)
}
