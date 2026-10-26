/**
 * The tint of a card or a region, from its `color` attribute: the name of a
 * palette entry of the theme (`--palette-<name>-bg`, `-main`, `-text`), or a
 * hexadecimal color or a color function from which the tint is mixed. A name the
 * theme leaves undefined takes the accent.
 */

const NAME = /^[a-z][a-z0-9-]*$/
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([\d\s.,%/+a-z-]*\))$/i

/** The three custom properties a card reads, pointed at the named or given tint. */
export function paletteVars(color?: string): Record<string, string> | undefined {
  if (!color)
    return undefined
  if (NAME.test(color)) {
    return {
      '--tone-bg': `var(--palette-${color}-bg, var(--accent-bg))`,
      '--tone-main': `var(--palette-${color}-main, var(--accent))`,
      '--tone-text': `var(--palette-${color}-text, var(--accent-strong))`,
    }
  }
  if (COLOR.test(color)) {
    return {
      '--tone-bg': `color-mix(in oklab, ${color} 12%, var(--surface))`,
      '--tone-main': color,
      '--tone-text': `color-mix(in oklab, ${color} 55%, var(--text-title))`,
    }
  }
  return undefined
}
