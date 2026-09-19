import type { RevealConfig, ThemeBackgrounds } from '../deck/schema.ts'
import { THEME_ALIASES as BUILT_IN_ALIASES, THEME_TOKENS as BUILT_IN_TOKENS } from './tokens.generated.ts'

// The data side of a theme (backgrounds, Reveal dimensions, language, parser),
// declared by each theme's `theme.json`. Colors stay authored in SCSS.
/**
 * What a catalog card needs to draw a deck's title slide without the theme's
 * stylesheet: the type, the colors of the title and the text, and the surface
 * shown when the slide has no background image.
 */
export interface ThemePreview {
  fontFamily?: string
  /** Stylesheet declaring the font faces, loaded by the pages that show previews. */
  fontsStylesheet?: string
  titleColor?: string
  /** A gradient painted through the letters of the title. */
  titleGradient?: string
  textColor?: string
  surface?: string
  /**
   * Colors for a first slide of another heading level, whose background differs.
   * `titleGradient: 'none'` removes the gradient.
   */
  levels?: Partial<Record<'h1' | 'h2' | 'h3', Pick<ThemePreview, 'titleColor' | 'titleGradient' | 'textColor'>>>
}

export interface ThemeTokens {
  /** Matches `/themes/<name>.css` and the theme directory. */
  name: string
  backgrounds?: ThemeBackgrounds
  preview?: ThemePreview
  reveal?: RevealConfig
  lang?: string
  parser?: 'heading' | 'separator'
}

export interface ThemeRegistry {
  tokens: Record<string, ThemeTokens>
  /** Frontmatter names that resolve to another theme (declared by a theme's `aliases`). */
  aliases: Record<string, string>
}

// The registry starts with the application's own themes (generated at build time
// from their manifests). Tenant themes arrive at runtime: the server loads them
// from the content space or the object storage, and the universal plugin seeds
// the client with the same registry, so both sides resolve names identically.
const BUILT_IN: ThemeRegistry = { tokens: BUILT_IN_TOKENS, aliases: BUILT_IN_ALIASES }
let current: ThemeRegistry = BUILT_IN

export function builtInThemeRegistry(): ThemeRegistry {
  return BUILT_IN
}

/** Replace the runtime registry with the built-in themes plus `extra` (tenant themes win on conflicts). */
export function setThemeRegistry(extra: Partial<ThemeRegistry> | null | undefined): ThemeRegistry {
  current = {
    tokens: { ...BUILT_IN.tokens, ...(extra?.tokens ?? {}) },
    aliases: { ...BUILT_IN.aliases, ...(extra?.aliases ?? {}) },
  }
  return current
}

export function getThemeRegistry(): ThemeRegistry {
  return current
}

/** Canonical theme names; aliases are accepted on input and resolved with {@link resolveThemeName}. */
export function knownThemes(): string[] {
  return Object.keys(current.tokens)
}

/** The theme a frontmatter name points to: itself, or the theme that declares it as an alias. */
export function resolveThemeName(name: string): string
export function resolveThemeName(name?: string): string | undefined
export function resolveThemeName(name?: string): string | undefined {
  return name ? (current.aliases[name] ?? name) : undefined
}

export function isKnownTheme(name: string): boolean {
  return resolveThemeName(name) in current.tokens
}

export function getThemeTokens(name?: string): ThemeTokens | undefined {
  const canonical = resolveThemeName(name)
  return canonical ? current.tokens[canonical] : undefined
}

// The theme of a deck that declares none. A host names its own when it registers its themes.
const BUILT_IN_DEFAULT_THEME = 'minimal'
let defaultTheme = BUILT_IN_DEFAULT_THEME

/** Set the fallback theme; an empty name restores the built-in one. */
export function setDefaultTheme(name: string | null | undefined): string {
  defaultTheme = name || BUILT_IN_DEFAULT_THEME
  return defaultTheme
}

export function getDefaultTheme(): string {
  return defaultTheme
}
