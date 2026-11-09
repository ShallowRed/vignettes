import type { Slide } from '../deck/model.ts'
import type { DeckBrand } from '../deck/schema.ts'
import { titleSlideIndex } from '../deck/model.ts'
import { getThemeTokens } from '../theme/tokens.ts'

/** The bloc marque a renderer draws: the lines of its title, the operator's logo, the slides that show it, its version on a dark background. */
export interface SlideBrand {
  lines: string[]
  operator?: { src: string, alt: string }
  slides: NonNullable<DeckBrand['slides']>
  onDark: NonNullable<DeckBrand['onDark']>
}

const DEFAULT_LINES = ['République', 'française']

function brandFields(value: unknown): DeckBrand | undefined {
  return value && typeof value === 'object' ? value as DeckBrand : undefined
}

function titleLines(ministry: DeckBrand['ministry']): string[] {
  const lines = (Array.isArray(ministry) ? ministry : String(ministry ?? '').split('\n'))
    .map(line => String(line).trim())
    .filter(Boolean)
  return lines.length ? lines : DEFAULT_LINES
}

/**
 * The bloc marque of a deck: the keys of its frontmatter `brand` over those of
 * its theme's manifest. None when neither sets it, or when the deck writes
 * `brand: false`.
 */
export function deckBrand(meta: { theme?: string, brand?: unknown }): SlideBrand | undefined {
  if (meta.brand === false)
    return undefined
  const theme = brandFields(getThemeTokens(meta.theme)?.brand)
  const deck = brandFields(meta.brand)
  if (!theme && !deck)
    return undefined
  const fields = { ...theme, ...deck }
  const src = typeof fields.operator === 'string' ? fields.operator.trim() : ''
  return {
    lines: titleLines(fields.ministry),
    ...(src ? { operator: { src, alt: typeof fields.operatorAlt === 'string' ? fields.operatorAlt : '' } } : {}),
    slides: fields.slides === 'all' ? 'all' : 'cover',
    onDark: fields.onDark === 'color' ? 'color' : 'white',
  }
}

/**
 * Whether the slide at `index`, or the vertical slide `vertical` of its stack,
 * shows the bloc marque: every slide with `slides: all`, else the title slide,
 * the first of its stack when it has vertical slides.
 */
export function showsBrand(brand: SlideBrand | undefined, slides: readonly Pick<Slide, 'headingLevel'>[], index: number, vertical = 0): boolean {
  if (!brand)
    return false
  return brand.slides === 'all' || (index === titleSlideIndex(slides) && vertical === 0)
}
