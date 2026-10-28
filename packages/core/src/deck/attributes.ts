import type { DeckUrlKind } from './urls.ts'
import { componentKey, DECK_ANNOTATIONS, deckComponents } from './components.ts'
import { isDeckUrl, isRefusedEmbedUrl } from './urls.ts'

/**
 * The attributes an element of a deck keeps. MDC computes a bound attribute
 * (`:name="…"`) when it renders, from the data of the page or from the text of
 * the expression, after it has checked the text alone; the deck reads that text
 * as a JSON value here, so the renderer receives a plain attribute and every
 * address goes through `isDeckUrl`.
 */

/** The HTML attributes that take an address, by name in lower case without hyphens or colons. */
const URL_ATTRIBUTES: Readonly<Record<string, DeckUrlKind>> = {
  href: 'page',
  src: 'page',
  action: 'page',
  formaction: 'page',
  xlinkhref: 'page',
  poster: 'image',
  datasrc: 'page',
  datapreviewlink: 'page',
  datapreviewimage: 'image',
  datapreviewvideo: 'page',
  databackgroundimage: 'image',
  databackgroundiframe: 'page',
  databackgroundvideo: 'page',
}

// The attributes whose address opens on a click; the others load theirs in the page.
const LINK_ATTRIBUTES = new Set(['href', 'action', 'formaction', 'xlinkhref'])

// Reveal's overlay writes the address of these attributes into its HTML as it is.
const OVERLAY_ATTRIBUTES = new Set(['datapreviewlink', 'datapreviewimage', 'datapreviewvideo'])
const MARKUP_RE = /["<>]/

// The SVG elements that set the attribute `attributeName` names to a value of
// theirs, which no address rule reads.
const ANIMATION_TAGS = new Set(['animate', 'set'])

const BOUND_RE = /^(?::|v-bind:)(.+)$/
// Vue directives MDC applies: a whole object of attributes, a handler, a model.
const DIRECTIVE_RE = /^(?:v-bind$|v-on:|@|v-model)/

// Names that reach the prototype of the object they are set on.
const OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const withoutObjectKeys = (key: string, value: unknown) => OBJECT_KEYS.has(key) ? undefined : value

const attributeKey = (name: string) => name.toLowerCase().replace(/[-:]/g, '')

/** Whether the attribute `name` of an element `tag` takes an address, and which kind. */
export function urlKindOf(tag: string, name: string): DeckUrlKind | undefined {
  const key = attributeKey(name)
  const tagKey = componentKey(tag)
  const images = DECK_ANNOTATIONS.find(annotation => componentKey(annotation.tag) === tagKey)?.images
    ?? deckComponents().find(c => [c.name, ...(c.aliases ?? [])].some(n => componentKey(n) === tagKey))?.images
  if (images?.some(image => attributeKey(image) === key))
    return 'image'
  if (tagKey === 'img' && key === 'src')
    return 'image'
  return URL_ATTRIBUTES[key]
}

/**
 * Whether the page of a deck refuses to load the address that the attribute
 * `name` of an element `tag` gives (`isRefusedEmbedUrl`). The deck keeps the
 * attribute.
 */
export function isRefusedEmbed(tag: string, name: string, value: unknown): boolean {
  return urlKindOf(tag, name) !== undefined && !LINK_ATTRIBUTES.has(attributeKey(name)) && isRefusedEmbedUrl(value)
}

export type AttributeReading
  = | { name: string, value: unknown }
    | { refused: 'url' | 'binding' }

/**
 * One attribute as the deck reads it. A bound attribute keeps its JSON value
 * under its plain name, and is refused when its text is not JSON: it never
 * reads the page's data, and its JSON loses the keys `__proto__`,
 * `constructor` and `prototype`. A directive (`v-bind`, `v-on`, `@`,
 * `v-model`), one of these names, an address outside `isDeckUrl`, an
 * address of Reveal's overlay holding markup characters, and an SVG animation
 * of an address are refused.
 */
export function readAttribute(tag: string, name: string, value: unknown): AttributeReading {
  if (DIRECTIVE_RE.test(name))
    return { refused: 'binding' }
  const bound = BOUND_RE.exec(name)?.[1]
  if (OBJECT_KEYS.has(bound ?? name))
    return { refused: 'binding' }
  let reading = { name, value }
  if (bound) {
    try {
      reading = { name: bound, value: typeof value === 'string' ? JSON.parse(value, withoutObjectKeys) : value }
    }
    catch {
      return { refused: 'binding' }
    }
  }
  const key = attributeKey(reading.name)
  const kind = urlKindOf(tag, reading.name)
  if (kind && !isDeckUrl(reading.value, kind))
    return { refused: 'url' }
  if (OVERLAY_ATTRIBUTES.has(key) && MARKUP_RE.test(String(reading.value)))
    return { refused: 'url' }
  if (ANIMATION_TAGS.has(componentKey(tag)) && key === 'attributename' && URL_ATTRIBUTES[attributeKey(String(reading.value))])
    return { refused: 'url' }
  return reading
}

/** The attributes of an element that `readAttribute` keeps. */
export function deckAttributes(tag: string, props: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    const reading = readAttribute(tag, name, value)
    if ('name' in reading)
      kept[reading.name] = reading.value
  }
  return kept
}

/**
 * The text of an attribute holding `value`, as MDC reads it back: between
 * double quotes, or single quotes around a double quote. MDC reads no
 * backslash escape and decodes `&quot;`, which a value holding both quotes takes.
 */
export function attributeSource(name: string, value: string): string {
  if (!value.includes('"'))
    return `${name}="${value}"`
  return value.includes('\'') ? `${name}="${value.replaceAll('"', '&quot;')}"` : `${name}='${value}'`
}
