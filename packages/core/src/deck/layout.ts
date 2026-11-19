import type { BodyMediaLayoutSpec, ComponentAttribute } from './components.ts'
import type { OpenBlock } from './scan.ts'
import type { TextChange } from './text-edits.ts'
import { z } from 'zod'
import { attributeSource } from './attributes.ts'
import { componentKey, deckComponentNamed, deckComponents } from './components.ts'
import { ATX_RE, BLOCK_CLOSE_RE, blockAttributes, COMPONENT_LINE_RE, MARKDOWN_IMAGE_LINE_RE, proseLines, walk } from './scan.ts'

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

/** The sizes of the body text of a slide, around the theme's own `md` (see `text` in `LAYOUT_ATTRIBUTES`). */
export const TEXT_STEPS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
export type TextStep = typeof TEXT_STEPS[number]

/** The step of a slide that writes no `text`: the size of the theme's body. */
export const DEFAULT_TEXT_STEP: TextStep = 'md'

/** The margins of a slide that `inset` sets (see `LAYOUT_ATTRIBUTES`). */
export const INSET_VALUES = ['tight'] as const
export type Inset = typeof INSET_VALUES[number]

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
  /** The body is a screen or a gallery of screens, at the largest size the slide leaves them. */
  screen?: true
  /** The size of the body text, when it is not the theme's `md`. */
  text?: TextStep
  /** The margins of the slide, halved by `tight`. */
  inset?: Inset
}

export const LAYOUT_ATTRIBUTES: readonly ComponentAttribute[] = [
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
    boolean: true,
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
    name: 'text',
    values: TEXT_STEPS,
    default: DEFAULT_TEXT_STEP,
    description: {
      fr: 'Taille du corps de la diapositive (texte, listes, citations et leurs espacements), de xs à xl autour de la taille du thème ; les titres gardent leur taille, et le texte ne descend pas sous la taille minimale du thème',
      en: 'Size of the body of the slide (text, lists, quotes and their spacing), from xs to xl around the size of the theme; the headings keep their size, and the text stays above the smallest size of the theme',
    },
  },
  {
    name: 'inset',
    values: INSET_VALUES,
    description: { fr: 'Marges de la diapositive réduites de moitié, et lignes du texte sans largeur maximale (tight)', en: 'Margins of the slide halved, and lines of text without a maximum width (tight)' },
  },
  {
    name: 'screen',
    boolean: true,
    description: {
      fr: 'Le corps est un écran ou une galerie d\'écrans (`::StoryFrame`, `::Screens`) : le titre tient sur une ligne et les écrans prennent toute la place qu\'il laisse. Un écran sans `ratio` remplit sa place, un écran avec `ratio` y prend la plus grande taille à ces proportions',
      en: 'The body is a screen or a gallery of screens (`::StoryFrame`, `::Screens`): the heading keeps to one line and the screens take all the room it leaves. A screen without `ratio` fills its room, a screen with `ratio` takes the largest size at those proportions in it',
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

// MDC gives `true` for a bare attribute and the text for a written value.
const isSet = (value: unknown) => value === true || value === 'true' || value === ''

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
  screen: z.union([z.boolean(), z.enum(['true', 'false', ''])]).optional(),
  text: z.enum(TEXT_STEPS).optional(),
  inset: z.enum(INSET_VALUES).optional(),
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
    media: isSet(reverse) ? 'left' : 'right',
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

/** Where a `:layout` places its media: `media`, or on the right for a source written without it; none without either. */
export function layoutPlacement(attributes: { media?: unknown, src?: unknown, story?: unknown }): MediaPlacement | undefined {
  return (attributes.media as MediaPlacement | undefined) ?? (attributes.story || attributes.src ? 'right' : undefined)
}

/** The share a media at `placement` takes: `size`, or `DEFAULT_SIDE_MEDIA_SIZE` beside the text; none above, below or behind it. */
export function layoutSize(placement: MediaPlacement | undefined, size: MediaSize | undefined): MediaSize | undefined {
  return size ?? (placement === 'right' || placement === 'left' ? DEFAULT_SIDE_MEDIA_SIZE : undefined)
}

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
  if (attrs.text && attrs.text !== DEFAULT_TEXT_STEP)
    layout.text = attrs.text
  if (attrs.inset)
    layout.inset = attrs.inset

  const source = attrs.story || attrs.src
  const placement = layoutPlacement(attrs)
  const unused = (names: (keyof LayoutAttributes)[]) => {
    for (const name of names) {
      if (attrs[name] !== undefined)
        issues.push({ kind: 'unused', attribute: name })
    }
  }

  if (!placement) {
    unused([...MEDIA_SETTINGS])
    if (isSet(attrs.screen)) {
      layout.screen = true
      layout.heading ??= layoutDefault('heading', attrs) as HeadingMode
      // The screens take the room of the body, which has no text to size.
      unused(['text', 'inset'])
      delete layout.text
      delete layout.inset
    }
    return { layout, issues }
  }
  // A media pane lays the slide out on its own.
  unused(['screen'])
  if (!source) {
    issues.push({ kind: 'missing-source', attribute: 'src' })
    return { layout, issues }
  }
  // Reveal loads any address of a slide background as an image.
  if (placement === 'behind' && (attrs.story || attrs.type === 'iframe')) {
    issues.push({ kind: 'behind-needs-image', attribute: attrs.story ? 'story' : 'type' })
    return { layout, issues }
  }

  if (placement === 'behind')
    unused([...PANE_SETTINGS])
  else
    unused([...BEHIND_SETTINGS])

  const veil = attrs.veil ? Number(PERCENT_RE.exec(attrs.veil)![1]) / 100 : undefined
  layout.media = {
    placement,
    ...(placement === 'behind' ? {} : { size: layoutSize(placement, attrs.size) }),
    ...(attrs.story ? { story: attrs.story } : { src: attrs.src }),
    ...(attrs.type ? { type: attrs.type } : {}),
    fit: attrs.fit ?? 'cover',
    position: attrs.position ?? 'center',
    alt: attrs.alt ?? '',
    lightbox: isSet(attrs.lightbox),
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
const BOOLEANS = new Set(LAYOUT_ATTRIBUTES.filter(attribute => attribute.boolean).map(attribute => attribute.name))

/**
 * The text of a `:layout` annotation with these attributes in their current
 * form, in the order of `LAYOUT_ATTRIBUTES`; an empty string without any. A
 * `true`/`false` attribute is written alone when true and left out when false.
 */
export function layoutSource(attributes: Attributes): string {
  const modern = modernLayoutAttributes(attributes)
  const rank = (key: string) => ATTRIBUTE_ORDER.includes(key) ? ATTRIBUTE_ORDER.indexOf(key) : ATTRIBUTE_ORDER.length
  const parts = Object.keys(modern).sort((a, b) => rank(a) - rank(b)).flatMap((key) => {
    const value = modern[key]
    if (value === undefined || value === '')
      return []
    if (BOOLEANS.has(key))
      return value === false || value === 'false' ? [] : [key]
    return [attributeSource(key, String(value))]
  })
  return parts.length ? `:layout{${parts.join(' ')}}` : ''
}

/**
 * The value of an attribute of `:layout` when the annotation leaves it out,
 * among the other attributes it writes: a screen slide keeps its heading to
 * one line.
 */
export function layoutDefault(name: string, attributes: Attributes = {}): string | undefined {
  if (name === 'heading' && isSet(attributes.screen))
    return 'compact'
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
  delete next.screen
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

/** How `:layout` shows a markdown image written alone in a slide body. */
export const MARKDOWN_IMAGE_LAYOUT: BodyMediaLayoutSpec = { attributes: { src: 'src', alt: 'alt' }, type: 'image' }

/**
 * The `:layout` attributes that show a media of the body as its component
 * draws it: its attributes under their `:layout` names, a setting the
 * component defaults otherwise than `:layout` written out, and `type` when the
 * address alone would give the other kind. Without `media`, which the caller
 * chooses.
 */
export function bodyMediaLayout(media: { component: string, attributes: Readonly<Record<string, string | true>> }): Attributes {
  const component = media.component === 'image' ? undefined : deckComponents().find(declared => componentKey(declared.name) === componentKey(media.component))
  const spec = media.component === 'image' ? MARKDOWN_IMAGE_LAYOUT : component?.layout
  const declared = component?.attributes ?? []
  const next: Attributes = {}
  for (const [written, name] of Object.entries(spec?.attributes ?? {})) {
    const value = media.attributes[written] ?? declared.find(attribute => attribute.name === written)?.default
    if (value !== undefined && value !== '' && value !== 'false' && value !== layoutDefault(name))
      next[name] = value
  }
  if (spec?.type && !next.type && typeof next.src === 'string' && inferMediaType(next.src) !== spec.type)
    next.type = spec.type
  return next
}

/** An attribute written in a `:layout` annotation: its value, `true` when written alone, and its place in the line. */
export interface LayoutAnnotationAttribute {
  name: string
  value: string | true
  /** 0-based column, and length of the attribute's text. */
  column: number
  length: number
}

/** A `:layout{…}` annotation written in the source. */
export interface LayoutAnnotation {
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of `:layout`, and length of the annotation's text. */
  column: number
  length: number
  attributes: LayoutAnnotationAttribute[]
}

const LAYOUT_ANNOTATION_RE = /:layout\{([^{}]*)\}/g

/** The `:layout` annotations of a deck, outside the frontmatter, fenced code and inline code. */
export function layoutAnnotations(raw: string): LayoutAnnotation[] {
  const annotations: LayoutAnnotation[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const block of prose.matchAll(LAYOUT_ANNOTATION_RE)) {
      const attributes = [...blockAttributes(block[1]!, block.index + ':layout{'.length)]
        .map(({ value, ...attribute }) => ({ ...attribute, value: value ?? true as const }))
      annotations.push({ line, column: block.index, length: block[0].length, attributes })
    }
  }
  return annotations
}

/** The attributes of an annotation, by name, as `readLayout` reads them. */
export function layoutAnnotationValues(annotation: LayoutAnnotation): Record<string, string | true> {
  return Object.fromEntries(annotation.attributes.map(attribute => [attribute.name, attribute.value]))
}

/**
 * The change that writes `source` in place of an annotation of `raw`. An empty
 * `source` removes the annotation, and the annotation alone on its line goes
 * with its line and the blank line after it.
 */
export function layoutAnnotationChange(raw: string, annotation: LayoutAnnotation, source: string): TextChange {
  const lines = raw.split('\n')
  const lineFrom = lines.slice(0, annotation.line - 1).reduce((offset, line) => offset + line.length + 1, 0)
  const text = lines[annotation.line - 1]!
  const from = lineFrom + annotation.column
  const to = from + annotation.length
  if (source || text.trim() !== raw.slice(from, to))
    return { from, to, insert: source }
  const next = lines[annotation.line]
  const end = lineFrom + text.length + (next !== undefined && !next.trim() ? next.length + 1 : 0)
  return { from: lineFrom, to: Math.min(end + 1, raw.length), insert: '' }
}

/** An attribute of a `:layout` annotation that `readLayout` leaves out, placed in the source; `legacyMentions` places the attributes it translates. */
export interface LayoutMention {
  kind: Exclude<LayoutIssueKind, 'legacy'>
  attribute: string
  /** 1-based line, 0-based column and length of the marked text: the attribute, or the annotation when it names no attribute. */
  line: number
  column: number
  length: number
}

/** The issues `readLayout` finds in each `:layout` annotation of a deck, placed on their attribute. */
export function layoutMentions(raw: string): LayoutMention[] {
  return layoutAnnotations(raw).flatMap((annotation) => {
    const { issues } = readLayout(layoutAnnotationValues(annotation))
    return issues.flatMap(({ kind, attribute }) => kind === 'legacy' ? [] : [{ kind, attribute }]).map((issue) => {
      const written = annotation.attributes.find(attribute => attribute.name === issue.attribute)
      return {
        ...issue,
        line: annotation.line,
        column: written?.column ?? annotation.column,
        length: written?.length ?? annotation.length,
      }
    })
  })
}

/** A media written alone on a top-level line of a slide body, or as a block of its own. */
export interface BodyMedia {
  /** The component that draws it, by its declared name; `image` for a markdown image. */
  component: string
  /** Its attributes as written; a markdown image gives `src` and `alt`. */
  attributes: Record<string, string | true>
  /** 1-based first and last lines in the slide text, the closing line of a block included. */
  from: number
  to: number
  /**
   * `:layout` can show it as its component does: it is the only media of the
   * slide, it holds no content, label or title, and `:layout` takes each of
   * its attributes.
   */
  movable: boolean
}

const MEDIA_GROUPS = new Set(['media', 'storybook'])

/**
 * A media as the walk finds it: how `:layout` shows it, whether its block holds
 * content, whether it carries a label or a title.
 */
type FoundMedia = Omit<BodyMedia, 'movable'> & { spec?: BodyMediaLayoutSpec, content: boolean, captioned: boolean }

/** The attributes of a `{…}` block, by name; an attribute written alone is `true`. */
function writtenAttributes(content = ''): Record<string, string | true> {
  return Object.fromEntries([...blockAttributes(content, 0)].map(attribute => [attribute.name, attribute.value ?? true]))
}

/** Whether the line at `index` stands apart: after a blank line, a heading or the end of a block, and before a blank line. */
function isApart(lines: readonly string[], index: number): boolean {
  const previous = lines[index - 1]
  const next = lines[index + 1]
  const before = previous === undefined || !previous.trim() || ATX_RE.test(previous) || BLOCK_CLOSE_RE.test(previous)
  return before && (next === undefined || !next.trim())
}

/** The media of a slide body, from the text of one slide as `splitSlides` gives it. */
export function bodyMedia(text: string): BodyMedia[] {
  const lines = text.split('\n')
  const found: FoundMedia[] = []
  let block: { media: FoundMedia, open: OpenBlock } | undefined
  // `walk` yields one array of open blocks, which it changes: its length before the line is kept.
  let openBefore = 0
  for (const { index, text: line, code, open } of walk(lines, 0)) {
    const before = openBefore
    openBefore = open.length
    if (block) {
      if (!open.includes(block.open)) {
        found.push({ ...block.media, to: index + 1 })
        block = undefined
      }
      else if (line.trim() && open.length === 1) {
        block.media.content = true
      }
      continue
    }
    // A media of the body starts its line; an image or an inline component also
    // stands apart from the text around it, or it belongs to a paragraph.
    if (code || before || !/^\S/.test(line))
      continue
    const apart = isApart(lines, index)
    const image = apart && MARKDOWN_IMAGE_LINE_RE.exec(line)
    if (image) {
      found.push({ component: 'image', attributes: { src: image[2]!, alt: image[1]!, ...writtenAttributes(image[4]) }, from: index + 1, to: index + 1, spec: MARKDOWN_IMAGE_LAYOUT, content: false, captioned: Boolean(image[3]?.trim()) })
      continue
    }
    const written = COMPONENT_LINE_RE.exec(line)
    const component = written && deckComponentNamed(written[2]!)
    if (!written || !component || !MEDIA_GROUPS.has(component.group ?? '') || (written[1]!.length === 1 && !apart))
      continue
    const media: FoundMedia = { component: component.name, attributes: writtenAttributes(written[4]), from: index + 1, to: index + 1, spec: component.layout, content: false, captioned: Boolean(written[3]) }
    if (written[1]!.length > 1 && open.length === 1)
      block = { media, open: open[0]! }
    else
      found.push(media)
  }
  if (block)
    found.push({ ...block.media, to: lines.length })
  return found.map(({ spec, content, captioned, ...media }) => {
    const names = spec?.attributes
    const taken = Boolean(names) && Object.keys(media.attributes).every(name => name in names!)
    const movable = found.length === 1 && !content && !captioned && taken && !readLayout({ media: 'right', ...bodyMediaLayout(media) }).issues.length
    return { ...media, movable }
  })
}
