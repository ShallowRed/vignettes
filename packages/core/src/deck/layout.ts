import type { LocalizedText } from './components.ts'
import { z } from 'zod'
import { attributeSource } from './attributes.ts'
import { componentKey } from './components.ts'

/**
 * The settings of `:layout`, as data: the attributes an author writes, the
 * values each one takes, and how the parser reads them into a `SlideLayout`.
 * The parsers, the renderer, the editor and the deck plugin read this module.
 */

export const MEDIA_PLACEMENTS = ['right', 'left', 'top', 'bottom', 'behind'] as const
export type MediaPlacement = typeof MEDIA_PLACEMENTS[number]

/** The share of the slide the media takes: of its width on a side, of its height above or below. */
export const MEDIA_SIZES = ['1/3', '1/2', '2/3', '3/4'] as const
export type MediaSize = typeof MEDIA_SIZES[number]

export const DEFAULT_SIDE_MEDIA_SIZE: MediaSize = '1/2'

export const MEDIA_FITS = ['cover', 'contain'] as const
export type MediaFit = typeof MEDIA_FITS[number]

export const MEDIA_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const
export type MediaPosition = typeof MEDIA_POSITIONS[number]

export const MEDIA_TYPES = ['image', 'iframe'] as const
export type MediaType = typeof MEDIA_TYPES[number]

export const HEADING_MODES = ['compact', 'hidden', 'print'] as const
export type HeadingMode = typeof HEADING_MODES[number]

/** The vertical alignment of the content of a slide (see `align` in `LAYOUT_ATTRIBUTES`). */
export const VERTICAL_ALIGNS = ['top', 'center', 'bottom'] as const
export type VerticalAlign = typeof VERTICAL_ALIGNS[number]

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|avif)(?:[?#]|$)/i

/**
 * Whether a media source is shown as a page or an image. An explicit `type` or a
 * story decides; otherwise a URL ending with an image extension is an image, and
 * any other URL a page.
 */
export function inferMediaType(src: string, type?: string, story?: boolean): MediaType {
  if (type === 'iframe' || type === 'image')
    return type
  if (story)
    return 'iframe'
  return IMAGE_EXTENSION.test(src) ? 'image' : 'iframe'
}

/** The width, in pixels, a page or a story is laid out at before it is shrunk to its pane. */
export const DEFAULT_MEDIA_VIEWPORT = 1440

/** The media pane of a slide. `size` is absent above or below when the media takes the height the text leaves, and behind the text. */
export interface MediaLayout {
  placement: MediaPlacement
  size?: MediaSize
  src?: string
  /** A story id of the deck's Storybook, shown in place of `src`. */
  story?: string
  type?: MediaType
  fit: MediaFit
  position: MediaPosition
  alt: string
  lightbox: boolean
  hint?: string
  viewport: number
  /** Behind the text: the share of black laid over the image, from 0 to 1. Without it, the text sits on a card. */
  veil?: number
}

export interface SlideLayout {
  media?: MediaLayout
  heading?: HeadingMode
  align?: VerticalAlign
}

export interface LayoutAttribute {
  name: string
  /** The closed set of values, when the attribute has one. */
  values?: readonly string[]
  /** The value that applies when the attribute is absent. */
  default?: string
  /** Written alone, without a value, to turn it on. */
  flag?: boolean
  description: LocalizedText
}

export const LAYOUT_ATTRIBUTES: readonly LayoutAttribute[] = [
  {
    name: 'media',
    values: MEDIA_PLACEMENTS,
    default: 'right',
    description: { fr: 'Place du média : à droite, à gauche, en haut, en bas ou derrière le texte', en: 'Place of the media: right, left, top, bottom or behind the text' },
  },
  {
    name: 'size',
    values: MEDIA_SIZES,
    description: { fr: `Part de la diapositive que prend le média : de sa largeur à droite ou à gauche, ${DEFAULT_SIDE_MEDIA_SIZE} par défaut ; de sa hauteur en haut ou en bas, où le média prend par défaut la hauteur que le texte laisse`, en: `Share of the slide the media takes: of its width on a side, ${DEFAULT_SIDE_MEDIA_SIZE} by default; of its height at the top or the bottom, where the media takes by default the height the text leaves` },
  },
  {
    name: 'src',
    description: { fr: 'Adresse de l\'image ou de la page web', en: 'Address of the image or the web page' },
  },
  {
    name: 'story',
    description: { fr: 'Identifiant d\'une story du Storybook de la présentation, affichée dans le panneau du média', en: 'Id of a story of the deck\'s Storybook, shown in the media pane' },
  },
  {
    name: 'type',
    values: MEDIA_TYPES,
    description: { fr: 'Image ou page web, pour une adresse sans extension d\'image', en: 'Image or web page, for an address without an image extension' },
  },
  {
    name: 'fit',
    values: MEDIA_FITS,
    default: 'cover',
    description: { fr: 'cover remplit le panneau et peut couper les bords, contain montre le média entier', en: 'cover fills the pane and may crop the edges, contain shows the whole media' },
  },
  {
    name: 'position',
    values: MEDIA_POSITIONS,
    default: 'center',
    description: { fr: 'Partie du média gardée quand cover le recadre', en: 'Part of the media kept when cover crops it' },
  },
  {
    name: 'alt',
    description: { fr: 'Description du média pour les personnes qui ne le voient pas', en: 'Description of the media for people who cannot see it' },
  },
  {
    name: 'lightbox',
    flag: true,
    description: { fr: 'Le média s\'ouvre en grand au clic', en: 'The media opens full screen on a click' },
  },
  {
    name: 'hint',
    description: { fr: 'Texte au bas de la colonne de texte, avec une flèche vers le média', en: 'Text at the bottom of the text column, with an arrow towards the media' },
  },
  {
    name: 'viewport',
    default: String(DEFAULT_MEDIA_VIEWPORT),
    description: { fr: 'Largeur en pixels à laquelle on affiche la page ou la story avant de la réduire au panneau', en: 'Width in pixels the page or the story is laid out at before it is shrunk to the pane' },
  },
  {
    name: 'veil',
    description: { fr: 'Derrière le texte : voile sombre sur l\'image, en pourcentage, et texte en couleur claire ; sans voile, le texte est sur un cadre', en: 'Behind the text: dark veil over the image, as a percentage, with the text in a light color; without a veil, the text sits on a card' },
  },
  {
    name: 'align',
    values: VERTICAL_ALIGNS,
    description: {
      fr: 'Alignement vertical du contenu : du titre et du texte sur une diapositive de titre ou de section, du corps sous le titre sur une diapositive de contenu, du texte dans sa colonne à côté d\'un média, du cadre de texte devant une image. Par défaut : centré ; en haut pour une colonne de légendes à 3/4 et pour un texte au-dessus ou au-dessous d\'un média ; en bas pour le cadre devant une image',
      en: 'Vertical alignment of the content: of the heading and the text on a title or a section slide, of the body under the heading on a content slide, of the text in its column beside a media, of the text card over an image. By default: centered; at the top for a caption column at 3/4 and for a text above or below a media; at the bottom for the card over an image',
    },
  },
  {
    name: 'heading',
    values: HEADING_MODES,
    description: { fr: 'Titre sur une ligne (compact), masqué (hidden) ou masqué à l\'écran seulement (print)', en: 'Heading on one line (compact), hidden, or hidden on screen only (print)' },
  },
] as const

/**
 * Why an attribute of `:layout` is not read as written. `legacy` marks an
 * attribute of the decks written before `media` and `size`, which the parser
 * also reads.
 */
export type LayoutIssueKind = 'unknown-attribute' | 'invalid-value' | 'legacy' | 'missing-source' | 'unused' | 'behind-needs-image'

export interface LayoutIssue {
  kind: LayoutIssueKind
  attribute: string
}

type Attributes = Record<string, unknown>

const PERCENT_RE = /^(\d{1,3})%$/

const LayoutAttributesSchema = z.strictObject({
  media: z.enum(MEDIA_PLACEMENTS).optional(),
  size: z.enum(MEDIA_SIZES).optional(),
  src: z.string().min(1).optional(),
  story: z.string().min(1).optional(),
  type: z.enum(MEDIA_TYPES).optional(),
  fit: z.enum(MEDIA_FITS).optional(),
  position: z.enum(MEDIA_POSITIONS).optional(),
  alt: z.string().optional(),
  // MDC gives `true` for a bare attribute and the text for a written value.
  lightbox: z.union([z.boolean(), z.enum(['true', 'false', ''])]).optional(),
  hint: z.string().optional(),
  viewport: z.string().regex(/^[1-9]\d{1,4}$/).optional(),
  veil: z.string().refine(value => Number(PERCENT_RE.exec(value)?.[1] ?? Number.NaN) <= 100).optional(),
  heading: z.enum(HEADING_MODES).optional(),
  align: z.enum(VERTICAL_ALIGNS).optional(),
})

type LayoutAttributes = z.infer<typeof LayoutAttributesSchema>

const LEGACY_NAMES: Readonly<Record<string, Attributes>> = {
  'media-right': { media: 'right' },
  'media-left': { media: 'left' },
  'media-right-wide': { media: 'right', size: '2/3' },
  'media-left-wide': { media: 'left', size: '2/3' },
  'media-right-xwide': { media: 'right', size: '3/4' },
  'media-left-xwide': { media: 'left', size: '3/4' },
  'media-below': { media: 'bottom' },
  'media-above': { media: 'top' },
  'media-cover': { media: 'behind' },
  'grid-compact': { heading: 'compact' },
  // `full` named the rendering of a full-slide component; a slide keeps its heading.
  'full': {},
}

const LEGACY_VIEWPORT_KEYS = ['previewWidth', 'preview-width', 'previewwidth']

/**
 * The attributes in their current form, and the names of the attributes of
 * the earlier format they replace. A legacy name the format never had stays
 * as written, so validation reports it.
 */
function modernAttributes(attributes: Attributes): { attributes: Attributes, legacy: string[] } {
  const modern: Attributes = {}
  const legacy: string[] = []
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'name' && typeof value === 'string' && Object.hasOwn(LEGACY_NAMES, value)) {
      Object.assign(modern, LEGACY_NAMES[value])
      legacy.push(key)
    }
    else if (LEGACY_VIEWPORT_KEYS.includes(key)) {
      modern.viewport = String(value)
      legacy.push(key)
    }
    else if (key === 'title') {
      modern.alt ??= value
      legacy.push(key)
    }
    else if (key === 'raw') {
      legacy.push(key)
    }
    else {
      modern[key] = value
    }
  }
  // An earlier `media-cover` with a page or a story goes to the top: behind the
  // text, the slide shows an image.
  if (attributes.name === 'media-cover' && inferMediaType(String(attributes.src ?? ''), String(attributes.type ?? ''), Boolean(attributes.story)) !== 'image')
    modern.media = 'top'
  return { attributes: modern, legacy }
}

function validated(attributes: Attributes, issues: LayoutIssue[]): LayoutAttributes {
  const result = LayoutAttributesSchema.safeParse(attributes)
  if (result.success)
    return result.data
  const kept = { ...attributes }
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        issues.push({ kind: 'unknown-attribute', attribute: key })
        delete kept[key]
      }
    }
    else {
      const key = String(issue.path[0])
      issues.push({ kind: 'invalid-value', attribute: key })
      delete kept[key]
    }
  }
  return LayoutAttributesSchema.safeParse(kept).data ?? {}
}

// `SplitSlide` wrote the share of the text and of the media as a ratio.
const LEGACY_RATIOS: Readonly<Record<string, MediaSize>> = { '1:1': '1/2', '1:2': '2/3', '1:3': '3/4', '2:1': '1/3', '3:1': '1/3' }

function percentOf(overlay: unknown): string | undefined {
  const value = Number.parseFloat(String(overlay))
  return value > 0 ? `${Math.round(Math.min(value, 1) * 100)}%` : undefined
}

const LEGACY_COMPONENTS: Readonly<Record<string, (props: Attributes) => Attributes>> = {
  fullscreenimage: ({ src, alt, overlay, heading }) => ({ media: 'behind', src, type: 'image', alt, veil: percentOf(overlay), heading }),
  splitslide: ({ src, type, fit, alt, title, lightbox, ratio, reverse }) => ({
    media: reverse === true || reverse === 'true' || reverse === '' ? 'left' : 'right',
    size: LEGACY_RATIOS[String(ratio ?? '1:2')],
    src,
    type: type ?? 'iframe',
    fit,
    alt: alt ?? title,
    lightbox,
  }),
}

/**
 * The `:layout` attributes of a component of the earlier format that drew a
 * media beside or behind the text of its slide (`FullScreenImage`,
 * `SplitSlide`), or undefined for any other component. The parser lays the
 * slide out with them and keeps the text the component wrapped.
 */
export function legacyComponentLayout(name: string, props: Attributes): Attributes | undefined {
  const read = LEGACY_COMPONENTS[componentKey(name)]
  if (!read)
    return undefined
  return Object.fromEntries(Object.entries(read(props)).filter(([, value]) => value !== undefined && value !== ''))
}

// The settings of a media, which a slide without one leaves unused; the
// settings of a media pane, which an image behind the text leaves unused; and
// the setting of an image behind the text, which a pane leaves unused.
const MEDIA_SETTINGS = ['size', 'type', 'fit', 'position', 'alt', 'lightbox', 'hint', 'viewport', 'veil'] as const
const PANE_SETTINGS = ['size', 'lightbox', 'hint', 'viewport'] as const
const BEHIND_SETTINGS = ['veil'] as const

/**
 * Reads the attributes of a `:layout` annotation. A source without `media`
 * goes to the right; `media` without a source gives no media pane. The issues
 * name each attribute the reading left out or translated.
 */
export function readLayout(attributes: Attributes): { layout: SlideLayout, issues: LayoutIssue[] } {
  const { attributes: modern, legacy } = modernAttributes(attributes)
  const issues: LayoutIssue[] = legacy.map(attribute => ({ kind: 'legacy', attribute }))
  const attrs = validated(modern, issues)
  const layout: SlideLayout = {}
  if (attrs.heading)
    layout.heading = attrs.heading
  if (attrs.align)
    layout.align = attrs.align

  const source = attrs.story || attrs.src
  const placement = attrs.media ?? (source ? 'right' : undefined)
  const unused = (names: (keyof LayoutAttributes)[]) => {
    for (const name of names) {
      if (attrs[name] !== undefined)
        issues.push({ kind: 'unused', attribute: name })
    }
  }

  if (!placement) {
    unused([...MEDIA_SETTINGS])
    return { layout, issues }
  }
  if (!source) {
    issues.push({ kind: 'missing-source', attribute: 'src' })
    return { layout, issues }
  }
  // Reveal loads any address of a slide background as an image.
  if (placement === 'behind' && (attrs.story || attrs.type === 'iframe')) {
    issues.push({ kind: 'behind-needs-image', attribute: attrs.story ? 'story' : 'type' })
    return { layout, issues }
  }

  const side = placement === 'right' || placement === 'left'
  if (placement === 'behind')
    unused([...PANE_SETTINGS])
  else
    unused([...BEHIND_SETTINGS])

  const veil = attrs.veil ? Number(PERCENT_RE.exec(attrs.veil)![1]) / 100 : undefined
  layout.media = {
    placement,
    ...(placement === 'behind' ? {} : { size: attrs.size ?? (side ? DEFAULT_SIDE_MEDIA_SIZE : undefined) }),
    ...(attrs.story ? { story: attrs.story } : { src: attrs.src }),
    ...(attrs.type ? { type: attrs.type } : {}),
    fit: attrs.fit ?? 'cover',
    position: attrs.position ?? 'center',
    alt: attrs.alt ?? '',
    lightbox: attrs.lightbox === true || attrs.lightbox === 'true' || attrs.lightbox === '',
    ...(attrs.hint ? { hint: attrs.hint } : {}),
    viewport: attrs.viewport ? Number(attrs.viewport) : DEFAULT_MEDIA_VIEWPORT,
    ...(placement === 'behind' && veil !== undefined ? { veil } : {}),
  }
  if (layout.media.size === undefined)
    delete layout.media.size
  return { layout, issues }
}

/** The attributes of `:layout` in their current form: each attribute of the decks written before `media` and `size` is translated. */
export function modernLayoutAttributes(attributes: Attributes): Attributes {
  return modernAttributes(attributes).attributes
}

const ATTRIBUTE_ORDER = LAYOUT_ATTRIBUTES.map(attribute => attribute.name)
const FLAGS = new Set(LAYOUT_ATTRIBUTES.filter(attribute => attribute.flag).map(attribute => attribute.name))

/**
 * The text of a `:layout` annotation with these attributes in their current
 * form, in the order of `LAYOUT_ATTRIBUTES`; an empty string without any. A
 * flag is written alone when it is on and left out when it is off.
 */
export function layoutSource(attributes: Attributes): string {
  const modern = modernLayoutAttributes(attributes)
  const rank = (key: string) => ATTRIBUTE_ORDER.includes(key) ? ATTRIBUTE_ORDER.indexOf(key) : ATTRIBUTE_ORDER.length
  const parts = Object.keys(modern).sort((a, b) => rank(a) - rank(b)).flatMap((key) => {
    const value = modern[key]
    if (value === undefined || value === '')
      return []
    if (FLAGS.has(key))
      return value === false || value === 'false' ? [] : [key]
    return [attributeSource(key, String(value))]
  })
  return parts.length ? `:layout{${parts.join(' ')}}` : ''
}

/** The value of an attribute of `:layout` when the annotation leaves it out. */
export function layoutDefault(name: string): string | undefined {
  return LAYOUT_ATTRIBUTES.find(attribute => attribute.name === name)?.default
}

/**
 * The attributes of an annotation in their current form, with the media at
 * `placement`, or without a media for `none`: the settings the new placement
 * leaves unused go, and behind the text a story or a page goes too.
 */
export function layoutForPlacement(attributes: Attributes, placement: MediaPlacement | 'none'): Attributes {
  const next = { ...modernLayoutAttributes(attributes) }
  const drop = (names: readonly string[]) => names.forEach(name => delete next[name])
  if (placement === 'none') {
    drop(['media', 'src', 'story', ...MEDIA_SETTINGS])
    return next
  }
  next.media = placement
  if (placement === 'behind') {
    drop([...PANE_SETTINGS, 'story'])
    if (next.type === 'iframe')
      delete next.type
  }
  else {
    drop(BEHIND_SETTINGS)
  }
  return next
}
