import { knownThemes } from './tokens.ts'

// Pure, fs-free cross-check of a theme's three declarations that can drift:
// tokens manifest, compiled public/themes/<name>.css, and SCSS source themes/<name>/.
// The caller reads the directories; this only compares names.

export interface ThemeConsistencyInput {
  /** Defaults to {@link knownThemes}. */
  tokens?: readonly string[]
  /** Base names of the compiled `public/themes/*.css` files. */
  cssFiles: readonly string[]
  sourceDirs?: readonly string[]
}

export interface ThemeConsistencyReport {
  ok: boolean
  warnings: string[]
  /** Tokens but no compiled CSS — the dangerous case (404 link). */
  missingCss: string[]
  /** Compiled CSS but no tokens entry — renders, but flagged "unknown" per-deck. */
  missingTokens: string[]
}

export function checkThemeConsistency(input: ThemeConsistencyInput): ThemeConsistencyReport {
  const tokens = new Set(input.tokens ?? knownThemes())
  const css = new Set(input.cssFiles)
  const warnings: string[] = []

  const missingCss = [...tokens].filter(name => !css.has(name)).sort()
  for (const name of missingCss) {
    warnings.push(
      `theme "${name}" has a tokens entry but no public/themes/${name}.css — decks using it will link a missing stylesheet`,
    )
  }

  const missingTokens = [...css].filter(name => !tokens.has(name)).sort()
  for (const name of missingTokens) {
    warnings.push(
      `theme "${name}" has public/themes/${name}.css but no tokens entry — it renders, but is flagged "unknown" per deck (no backgrounds/dimensions)`,
    )
  }

  // SCSS source dir with no compiled CSS means `build:themes` didn't emit it.
  if (input.sourceDirs) {
    const orphanSources = input.sourceDirs
      .filter(name => !css.has(name))
      .sort()
    for (const name of orphanSources) {
      warnings.push(
        `theme source themes/${name}/ has no compiled public/themes/${name}.css — run \`pnpm build:themes\``,
      )
    }
  }

  return {
    ok: warnings.length === 0,
    warnings,
    missingCss,
    missingTokens,
  }
}
