import type { RevealConfig, ThemeBackgrounds } from '../deck/schema'

// Single source of truth for the data side of a theme (backgrounds, Reveal
// dimensions). shared/deck/presets.ts, the client THEME_BACKGROUNDS, and
// scripts/build-theme-tokens.ts all derive from it. Colors stay authored in SCSS.
export interface ThemeTokens {
  /** Must match `public/themes/<name>.css` and `themes/<name>/`. */
  name: string
  backgrounds?: ThemeBackgrounds
  reveal?: RevealConfig
  lang?: string
  parser?: 'heading' | 'separator'
}

export const THEME_TOKENS: Record<string, ThemeTokens> = {
  'dsfr': {
    name: 'dsfr',
    lang: 'fr',
    parser: 'separator',
    backgrounds: {
      h1: '/backgrounds/slide-bg-default.png',
      h2: '/backgrounds/slide-bg-contrast.png',
      h3: '/backgrounds/slide-bg-subtle.png',
    },
    reveal: {
      slideNumber: true,
      width: 1200,
      height: 800,
    },
  },
  'dsfr-alt': {
    // DSFR skin swapping only colors/typography, so same backgrounds and dimensions.
    name: 'dsfr-alt',
    lang: 'fr',
    parser: 'separator',
    backgrounds: {
      h1: '/backgrounds/slide-bg-default.png',
      h2: '/backgrounds/slide-bg-contrast.png',
      h3: '/backgrounds/slide-bg-subtle.png',
    },
    reveal: {
      slideNumber: true,
      width: 1200,
      height: 800,
    },
  },
  'dsfr-standalone': {
    // Self-contained DSFR variant that paints its own backgrounds, so no
    // background images here.
    name: 'dsfr-standalone',
    lang: 'fr',
    parser: 'separator',
    reveal: {
      slideNumber: true,
      width: 1200,
      height: 800,
    },
  },
  'minimal': {
    name: 'minimal',
    lang: 'fr',
    parser: 'separator',
    reveal: {
      slideNumber: true,
    },
  },
  'brand': {
    name: 'brand',
    lang: 'fr',
    parser: 'separator',
    backgrounds: {
      h1: '/backgrounds/brand-slide-contrast.png',
      h2: '/backgrounds/brand-slide-contrast.png',
      h3: '/backgrounds/brand-slide-subtle.png',
    },
    reveal: {
      slideNumber: true,
      width: 1200,
      height: 800,
    },
  },
}

/** Also used to validate frontmatter. */
export const KNOWN_THEMES = Object.keys(THEME_TOKENS)

export function getThemeTokens(name?: string): ThemeTokens | undefined {
  return name ? THEME_TOKENS[name] : undefined
}

export const THEME_BACKGROUNDS: Record<string, ThemeBackgrounds> = Object.fromEntries(
  Object.values(THEME_TOKENS).map(t => [t.name, t.backgrounds ?? {}]),
)
