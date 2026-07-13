import type { ThemeTokens } from '../theme/tokens'
import type { DeckMeta } from './schema'
import { KNOWN_THEMES, THEME_TOKENS } from '../theme/tokens'

/**
 * Named presets for preset-driven decks (the CodiMD route). Derived from the
 * theme tokens manifest: a preset is a theme's tokens projected into deck meta.
 */

export type PresetMeta = Pick<
  DeckMeta,
  'lang' | 'theme' | 'parser' | 'backgrounds' | 'reveal'
>

function presetFromTokens(tokens: ThemeTokens): PresetMeta {
  const preset: PresetMeta = { theme: tokens.name }
  if (tokens.lang)
    preset.lang = tokens.lang
  if (tokens.parser)
    preset.parser = tokens.parser
  if (tokens.backgrounds)
    preset.backgrounds = tokens.backgrounds
  if (tokens.reveal)
    preset.reveal = tokens.reveal
  return preset
}

export const PRESETS: Record<string, PresetMeta> = Object.fromEntries(
  Object.values(THEME_TOKENS).map(t => [t.name, presetFromTokens(t)]),
)

export const DEFAULT_PRESET = 'dsfr'

export { KNOWN_THEMES }

/**
 * Base preset layer. When the note picks a different known theme, only its
 * `backgrounds`/`reveal` are swapped in; scalar keys are layered on afterwards
 * by the caller's deep-merge.
 */
export function buildPresetBase(presetName: string, noteTheme?: unknown): PresetMeta {
  const preset: PresetMeta = { ...(PRESETS[presetName] ?? PRESETS[DEFAULT_PRESET]!) }
  const theme = typeof noteTheme === 'string' ? noteTheme : undefined
  if (theme && theme !== preset.theme && PRESETS[theme]) {
    const themePreset = PRESETS[theme]!
    if (themePreset.backgrounds)
      preset.backgrounds = themePreset.backgrounds
    if (themePreset.reveal)
      preset.reveal = themePreset.reveal
  }
  return preset
}
