/**
 * The tints the explanation cards accept, as `palette="blue-france"`. Their
 * values are custom properties a theme can redefine; see palette.css.
 */
export const PALETTE_NAMES: readonly string[] = [
  'blue-france',
  'blue-ecume',
  'blue-cumulus',
  'green-tilleul-verveine',
  'green-bourgeon',
  'green-emeraude',
  'green-menthe',
  'green-archipel',
  'yellow-tournesol',
  'yellow-moutarde',
  'orange-terre-battue',
  'brown-cafe-creme',
  'brown-caramel',
  'brown-opera',
  'beige-gris-galet',
  'pink-macaron',
  'pink-tuile',
  'purple-glycine',
]

/** The three custom properties a card reads, pointed at the named tint. */
export function paletteVars(name?: string): Record<string, string> | undefined {
  if (!name || !PALETTE_NAMES.includes(name))
    return undefined
  return {
    '--tone-bg': `var(--palette-${name}-bg)`,
    '--tone-main': `var(--palette-${name}-main)`,
    '--tone-text': `var(--palette-${name}-text)`,
  }
}
