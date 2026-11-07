import type { SlideRole } from './blocks.ts'
import type { PptxFont } from './font.ts'
import type { Box } from './layout.ts'
import { DEFAULT_PRINT_HEIGHT, DEFAULT_PRINT_WIDTH, mergeRevealConfig } from '@vignettes/core/render'
import { getDefaultTheme, getThemeTokens } from '@vignettes/core/theme'
import { fontFormat } from './font.ts'

/** The look of the slides of one role. Colors are six hexadecimal digits, without `#`. */
export interface PptxRoleStyle {
  background: string
  /** The address of the image the theme lays on the slides of this role. */
  backgroundImage?: string
  title: string
  /** The text size of the title, in slide pixels. */
  titleSize: number
  titleBold: boolean
  text: string
}

/** Where the title, the body and the media of one slide sit on the rendered slide; a part the slide does not show has no box. */
export interface PptxSlideBoxes {
  pretitle?: Box
  title?: Box
  body?: Box
  media?: Box
}

/**
 * The look of a deck as the host measured it on the rendered slides. Colors
 * are six hexadecimal digits, without `#`; sizes are slide pixels. A value the
 * host could not read is absent, and the fixed master gives it.
 */
export interface PptxStyle {
  width?: number
  height?: number
  /** The space between the edge of a slide and its text. */
  padding?: { x?: number, y?: number }
  font?: string
  mono?: string
  bodySize?: number
  text?: string
  title?: string
  mention?: string
  accent?: string
  pretitle?: { color?: string, size?: number }
  quote?: { color?: string, italic?: boolean, bold?: boolean }
  code?: { surface?: string, text?: string, size?: number }
  /** The head row of a table takes the head colors when the theme fills it. */
  table?: { headSurface?: string, headText?: string, line?: string }
  frame?: { surface?: string, line?: string, text?: string }
  roles?: Partial<Record<SlideRole, Partial<PptxRoleStyle>>>
  /** The boxes of each slide shown, in the order of the deck. */
  slides?: (PptxSlideBoxes | undefined)[]
}

/**
 * The master of the file: the size of the deck, its font and its colors, as
 * the host measured them, or fixed values that read on any slide.
 */
export interface PptxMaster {
  /** The size of a slide, in the pixels the deck is laid out in. */
  width: number
  height: number
  padding: { x: number, y: number }
  font: string
  mono: string
  /** Colors as six hexadecimal digits, without `#`. */
  title: string
  text: string
  mention: string
  accent: string
  /** The veil laid over an image behind the text, and the title and text over it. */
  veil: string
  onVeil: string
  pretitle: string
  quote: { color: string, italic: boolean, bold: boolean }
  code: { surface: string, text: string }
  table: { headSurface?: string, headText?: string, line: string }
  frame: { surface: string, line: string, text: string }
  roles: Record<SlideRole, PptxRoleStyle>
  /** Text sizes, in slide pixels. */
  sizes: {
    pretitle: number
    subtitle: number
    body: number
    code: number
    small: number
  }
  slideNumber: boolean
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset'])
const FALLBACK_FONT = 'Arial'

/** The families a CSS font stack names, in order, without their quotes. */
export function fontFamilies(stack: string): string[] {
  return stack.split(',').map(family => family.trim().replace(/^(["'])(.*)\1$/, '$2').trim()).filter(Boolean)
}

/** The first family a CSS font stack names; a generic family names none. */
export function fontName(stack: unknown): string | undefined {
  if (typeof stack !== 'string')
    return undefined
  return fontFamilies(stack).find(family => !GENERIC_FAMILIES.has(family.toLowerCase()))
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

const FIXED_ROLE = { background: 'FFFFFF', title: '111111', titleBold: true, text: '1A1A1A' }

/** The fixed master of a deck: the size of `meta.reveal`, the font of its theme, and colors that read on any slide. */
function fixedMaster(meta: Readonly<Record<string, unknown>>): PptxMaster {
  const reveal = meta.reveal && typeof meta.reveal === 'object' ? meta.reveal as Record<string, unknown> : {}
  const width = positive(reveal.width)
  const height = positive(reveal.height)
  const sized = width !== undefined && height !== undefined
  const W = sized ? width : DEFAULT_PRINT_WIDTH
  const H = sized ? height : DEFAULT_PRINT_HEIGHT
  const theme = typeof meta.theme === 'string' && meta.theme ? meta.theme : getDefaultTheme()
  return {
    width: W,
    height: H,
    padding: { x: Math.round(W * 0.06), y: Math.round(H * 0.05) },
    font: fontName(getThemeTokens(theme)?.preview?.fontFamily) ?? FALLBACK_FONT,
    mono: 'Courier New',
    title: '111111',
    text: '1A1A1A',
    mention: '595959',
    accent: '1F4FBF',
    veil: '000000',
    onVeil: 'FFFFFF',
    pretitle: '595959',
    quote: { color: '111111', italic: true, bold: false },
    code: { surface: 'F6F8FA', text: '1A1A1A' },
    table: { line: 'D0D0D0' },
    frame: { surface: 'F2F2F2', line: 'B4B4B4', text: '1A1A1A' },
    roles: {
      title: { ...FIXED_ROLE, titleSize: 56 },
      section: { ...FIXED_ROLE, titleSize: 48 },
      content: { ...FIXED_ROLE, titleSize: 36 },
    },
    sizes: { pretitle: 18, subtitle: 26, body: 24, code: 18, small: 14 },
    slideNumber: Boolean(mergeRevealConfig(reveal).slideNumber),
  }
}

/** The values of `measured` the host read, over `fixed`. */
function over<T extends object>(fixed: T, measured: Partial<T> | undefined): T {
  const read = Object.entries(measured ?? {}).filter(([, value]) => value !== undefined)
  return { ...fixed, ...Object.fromEntries(read) }
}

/**
 * The master of a deck: the values the host measured on the rendered deck,
 * the fixed master for the others. A role the deck does not show takes the
 * look of its content slides. The slides name the family of the font the file
 * embeds, then the font measured, then the font of the theme.
 */
export function pptxMaster(meta: Readonly<Record<string, unknown>>, style?: PptxStyle, embedded?: PptxFont): PptxMaster {
  const family = embedded && fontFormat(embedded.data) ? embedded.family : undefined
  const fixed = { ...fixedMaster(meta), ...(family ? { font: family } : {}) }
  if (!style)
    return fixed
  const sized = positive(style.width) !== undefined && positive(style.height) !== undefined
  const text = style.text ?? fixed.text
  const title = style.title ?? fixed.title
  const role = (name: SlideRole) => over(over({ ...fixed.roles[name], title, text }, style.roles?.content), style.roles?.[name])
  const bodySize = positive(style.bodySize) ?? fixed.sizes.body
  return {
    ...fixed,
    width: sized ? style.width! : fixed.width,
    height: sized ? style.height! : fixed.height,
    padding: over(fixed.padding, style.padding),
    font: family ?? style.font ?? fixed.font,
    mono: style.mono ?? fixed.mono,
    title,
    text,
    mention: style.mention ?? fixed.mention,
    accent: style.accent ?? fixed.accent,
    pretitle: style.pretitle?.color ?? style.mention ?? fixed.pretitle,
    quote: over({ ...fixed.quote, color: title }, style.quote),
    code: over(fixed.code, style.code),
    table: over(fixed.table, style.table),
    frame: over({ ...fixed.frame, text: style.mention ?? fixed.frame.text }, style.frame),
    roles: { title: role('title'), section: role('section'), content: role('content') },
    sizes: {
      ...fixed.sizes,
      pretitle: positive(style.pretitle?.size) ?? fixed.sizes.pretitle,
      subtitle: bodySize,
      body: bodySize,
      code: positive(style.code?.size) ?? fixed.sizes.code,
      small: Math.round(bodySize * 0.6),
    },
  }
}
