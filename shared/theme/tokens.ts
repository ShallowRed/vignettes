import type { RevealConfig, ThemeBackgrounds } from '../deck/schema'
import { THEME_ALIASES, THEME_TOKENS } from './tokens.generated'

// The data side of a theme (backgrounds, Reveal dimensions, language, parser),
// generated from each theme's `theme.json` by scripts/build-theme-tokens.ts.
// Colors stay authored in SCSS.
export interface ThemeTokens {
  /** Matches `public/themes/<name>.css` and the theme directory. */
  name: string
  backgrounds?: ThemeBackgrounds
  reveal?: RevealConfig
  lang?: string
  parser?: 'heading' | 'separator'
}

export { THEME_ALIASES, THEME_TOKENS }

/** Canonical theme names; aliases are accepted on input and resolved with {@link resolveThemeName}. */
export const KNOWN_THEMES = Object.keys(THEME_TOKENS)

/** The theme a frontmatter name points to: itself, or the theme that declares it as an alias. */
export function resolveThemeName(name: string): string
export function resolveThemeName(name?: string): string | undefined
export function resolveThemeName(name?: string): string | undefined {
  return name ? (THEME_ALIASES[name] ?? name) : undefined
}

export function isKnownTheme(name: string): boolean {
  return resolveThemeName(name) in THEME_TOKENS
}

export function getThemeTokens(name?: string): ThemeTokens | undefined {
  const canonical = resolveThemeName(name)
  return canonical ? THEME_TOKENS[canonical] : undefined
}

export const THEME_BACKGROUNDS: Record<string, ThemeBackgrounds> = Object.fromEntries(
  Object.values(THEME_TOKENS).map(t => [t.name, t.backgrounds ?? {}]),
)
