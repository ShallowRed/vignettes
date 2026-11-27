import type { ValueMention } from './mentions.ts'
import { IMAGE_EXTENSIONS, IMAGE_MIME_TYPES, imageExtFor } from '../media.ts'
import { attributeKey, urlKindOf } from './attributes.ts'
import { componentKey, deckComponentNamed } from './components.ts'
import { frontmatterKeyLines, frontmatterLineCount, splitFrontmatter } from './frontmatter.ts'
import { inferMediaType, LEGACY_COMPONENTS } from './layout.ts'
import { valueMentions } from './mentions.ts'
import { LINK_DEFINITION_RE, proseLines } from './scan.ts'
import { isDeckUrl, parsedForm, SITE_PATH_PREFIXES } from './urls.ts'

/**
 * The addresses of the images a deck writes, read from its text with their
 * place, for the command line: it checks the local images, uploads them and
 * writes their uploaded name at the place of each address.
 */

/** The class of an image address: a file beside the deck, an upload of the studio, a file of the site, an address of another site, a `data:` URL, or anything else. */
export type ImageSourceClass
  = | {
    kind: 'local'
    /** The path of the file, relative to the deck, decoded, without its query or fragment. */
    path: string
    /** The query or the fragment the address keeps after the path: `?v=2`, `#star`, or an empty text. */
    suffix: string
  }
  | { kind: 'uploaded' | 'site' | 'remote' | 'data' | 'other' }

const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i
const UPLOADED_NAME_RE = new RegExp(`^/media/[0-9a-f]{32}\\.(?:${IMAGE_MIME_TYPES.map(imageExtFor).join('|')})$`)
const ROOT_FILE_RE = /^\/[^/][^./]*\.[^/]+$/

/** The class of an image address, as `parsedForm` reads it, cut at its first `?` or `#` (see the contract of the command line). */
export function classifyImageSource(value: string): ImageSourceClass {
  const url = parsedForm(value)
  if (/^https?:/i.test(url))
    return { kind: 'remote' }
  if (/^data:image\//i.test(url))
    return isDeckUrl(url, 'image') ? { kind: 'data' } : { kind: 'other' }
  const cut = url.search(/[?#]/)
  const path = cut === -1 ? url : url.slice(0, cut)
  if (!path || path.includes('\\'))
    return { kind: 'other' }
  if (UPLOADED_NAME_RE.test(path))
    return { kind: 'uploaded' }
  if (path.startsWith('/')) {
    const first = path.split('/')[1]!
    return !path.startsWith('//') && (SITE_PATH_PREFIXES.includes(first) || ROOT_FILE_RE.test(path)) ? { kind: 'site' } : { kind: 'other' }
  }
  if (SCHEME_RE.test(path))
    return { kind: 'other' }
  try {
    return { kind: 'local', path: decodeURIComponent(path), suffix: cut === -1 ? '' : url.slice(cut) }
  }
  catch {
    return { kind: 'other' }
  }
}

/** A place in the text of a deck: 1-based line, 0-based column, length. */
export interface TextPlace {
  line: number
  column: number
  length: number
}

/** An image address a deck writes, with its class and its place. */
export interface ImageSource extends TextPlace {
  /** The address as the deck gives it to the image. */
  value: string
  source: ImageSourceClass
  /** The path of the key of the front matter that holds it (`['brand', 'operator']`), undefined in the body. */
  key?: readonly string[]
  /**
   * False when the place is not that of the address as written, for a value of
   * the front matter written otherwise than on the line of its key, in block
   * style, or a value of an attribute written with an escape: the place is then
   * that of its key or of its attribute, and the address cannot be replaced.
   */
  placed: boolean
}

/** A relative path of an image written in a deck, with its place. */
export interface ImagePath extends TextPlace {
  value: string
}

const LAYOUT_TAG = 'layout'

/** The place of the value inside the text `name="value"` of an attribute, when it is written there without an escape. */
function valuePlace(raw: string[], mention: ValueMention): TextPlace | undefined {
  const text = raw[mention.line - 1]!.slice(mention.column, mention.column + mention.length)
  const equals = text.indexOf('=')
  if (equals === -1)
    return undefined
  const quoted = text[equals + 1] === '"' || text[equals + 1] === '\''
  const from = equals + 1 + (quoted ? 1 : 0)
  const written = text.slice(from, quoted ? -1 : undefined)
  return written === mention.value ? { line: mention.line, column: mention.column + from, length: written.length } : undefined
}

/** The media type that the `src` of a block reads as, from the `:layout` attributes the block gives. */
function layoutMediaType(attributes: Readonly<Record<string, unknown>>): 'image' | 'iframe' | undefined {
  return typeof attributes.src === 'string'
    ? inferMediaType(attributes.src, typeof attributes.type === 'string' ? attributes.type : undefined, attributes.story !== undefined)
    : undefined
}

/**
 * The `:layout` attributes a block gives its media: those of `:layout`, those
 * a component of the earlier format translates (`LEGACY_COMPONENTS`), and
 * those a component sends to `src`, `type` and `story` by its `layout` key.
 * Undefined for a block that draws no media from a `src`.
 */
function blockMedia(tag: string, written: readonly ValueMention[]): { src: ValueMention, type: 'image' | 'iframe' | undefined } | undefined {
  const values = Object.fromEntries(written.map(mention => [mention.name, mention.value]))
  const key = componentKey(tag)
  if (key === LAYOUT_TAG || LEGACY_COMPONENTS[key]) {
    const src = written.findLast(mention => mention.name === 'src')
    const attributes = key === LAYOUT_TAG ? values : LEGACY_COMPONENTS[key]!(values)
    return src && { src, type: layoutMediaType(attributes) }
  }
  const spec = deckComponentNamed(tag)?.layout
  if (!spec)
    return undefined
  const layoutName = (mention: ValueMention) => Object.entries(spec.attributes).find(([from]) => attributeKey(from) === attributeKey(mention.name))?.[1]
  const sent = (name: string) => written.filter(mention => layoutName(mention) === name)
  const src = sent('src').at(-1)
  if (!src)
    return undefined
  if (Object.values(spec.attributes).includes('type')) {
    const attributes = { src: src.value, type: sent('type').at(-1)?.value, story: sent('story').at(-1)?.value }
    return { src, type: layoutMediaType(attributes) }
  }
  return { src, type: spec.type ?? inferMediaType(src.value) }
}

/** The values of a deck grouped by their `{…}` block, and the addresses of its links alone. */
function groupedValues(raw: string): ValueMention[][] {
  const groups = new Map<number | ValueMention, ValueMention[]>()
  for (const mention of valueMentions(raw)) {
    // A bound attribute holds a JSON value, which the deck reads apart.
    if (/^(?::|v-bind:)/.test(mention.name))
      continue
    const group = mention.block ?? mention
    groups.set(group, [...(groups.get(group) ?? []), mention])
  }
  return [...groups.values()]
}

/** The values of the front matter that take the address of an image: `brand.operator` and the values of `backgrounds`. */
function frontmatterImages(data: Record<string, unknown>): Array<{ path: string[], value: string }> {
  const images: Array<{ path: string[], value: string }> = []
  const brand = data.brand
  if (brand && typeof brand === 'object' && typeof (brand as Record<string, unknown>).operator === 'string')
    images.push({ path: ['brand', 'operator'], value: (brand as Record<string, string>).operator! })
  const backgrounds = data.backgrounds
  if (backgrounds && typeof backgrounds === 'object') {
    for (const [name, value] of Object.entries(backgrounds)) {
      if (typeof value === 'string')
        images.push({ path: ['backgrounds', name], value })
    }
  }
  return images
}

/**
 * The place of `value` on the line of its key: written in block style, without
 * quotes, between single quotes without `''`, or between double quotes without
 * a backslash, before an optional comment.
 */
function frontmatterValuePlace(lines: string[], key: { line: number, column: number, length: number }, value: string): TextPlace | undefined {
  const text = lines[key.line - 1]!.replace(/\r$/, '')
  const colon = /^\s*:[ \t]*/.exec(text.slice(key.column + key.length))
  if (!colon)
    return undefined
  const from = key.column + key.length + colon[0].length
  const written = text.slice(from).replace(/[ \t]+#.*$/, '').trimEnd()
  if (written === value && !/^['"]/.test(value))
    return { line: key.line, column: from, length: value.length }
  if ((written === `'${value}'` && !value.includes('\'')) || (written === `"${value}"` && !written.includes('\\')))
    return { line: key.line, column: from + 1, length: value.length }
  return undefined
}

function frontmatterSources(raw: string): ImageSource[] {
  const { data, yamlError } = splitFrontmatter(raw)
  if (yamlError)
    return []
  const lines = raw.split('\n')
  const keys = frontmatterKeyLines(raw)
  return frontmatterImages(data).map(({ path, value }) => {
    const key = keys.find(candidate => candidate.path.join('.') === path.join('.'))
    const place = key && frontmatterValuePlace(lines, key, value)
    const fallback = key ?? keys.find(candidate => candidate.path.join('.') === path[0]) ?? { line: 1, column: 0, length: 3 }
    const { line, column, length } = place ?? fallback
    return { value, source: classifyImageSource(value), key: path, line, column, length, placed: Boolean(place) }
  })
}

/**
 * The image addresses a deck writes, in the body then in the front matter: the
 * attributes that the key `images` of a component or an annotation names, the
 * `src` of a markdown image, the `src` of a media that `inferMediaType` reads
 * as an image (`:layout`, the components of the earlier format, and each block
 * of a component whose key `layout` sends an attribute to `src`, wherever the
 * block is written), and `brand.operator` and the values of `backgrounds`.
 */
export function deckImageSources(raw: string): ImageSource[] {
  const lines = raw.split('\n')
  const sources: ImageSource[] = []
  const seen = new Set<string>()
  const add = (mention: ValueMention) => {
    const at = `${mention.line}:${mention.column}`
    if (seen.has(at))
      return
    seen.add(at)
    const place = mention.block === undefined ? mention : valuePlace(lines, mention)
    const { line, column, length } = place ?? mention
    sources.push({ value: mention.value, source: classifyImageSource(mention.value), line, column, length, placed: Boolean(place) })
  }
  for (const group of groupedValues(raw)) {
    for (const mention of group) {
      if (urlKindOf(mention.tag, mention.name) === 'image')
        add(mention)
    }
    const media = blockMedia(group[0]!.tag, group)
    if (media?.type === 'image')
      add(media.src)
  }
  return [...frontmatterSources(raw), ...sources].sort((a, b) => a.line - b.line || a.column - b.column)
}

const HTML_SRC_RE = /<[a-z][\w-]*\s[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const DEFINITION_DESTINATION_RE = /^( {0,3}\[[^\]]+\]:[ \t]*)(?:<([^<>]+)>|(\S+))/

/**
 * The relative paths of images that `deckImageSources` does not read, which
 * the command line leaves as written: the `src="…"` of an HTML element, the
 * destination of a markdown reference definition, and the `src` of a media
 * that `inferMediaType` reads as a page.
 */
export function unreadImagePaths(raw: string): ImagePath[] {
  const paths: ImagePath[] = []
  const local = (value: string) => classifyImageSource(value).kind === 'local'
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(HTML_SRC_RE)) {
      const value = match[1] ?? match[2]!
      if (local(value))
        paths.push({ value, line, column: match.index + match[0].length - 1 - value.length, length: value.length })
    }
    const definition = LINK_DEFINITION_RE.test(prose) ? DEFINITION_DESTINATION_RE.exec(prose) : null
    const destination = definition && (definition[2] ?? definition[3]!)
    if (definition && destination && local(destination))
      paths.push({ value: destination, line, column: definition[1]!.length + (definition[2] === undefined ? 0 : 1), length: destination.length })
  }
  for (const group of groupedValues(raw)) {
    const media = blockMedia(group[0]!.tag, group)
    if (media?.type === 'iframe' && local(media.src.value)) {
      const place = valuePlace(raw.split('\n'), media.src) ?? media.src
      paths.push({ value: media.src.value, line: place.line, column: place.column, length: place.length })
    }
  }
  return paths.sort((a, b) => a.line - b.line || a.column - b.column)
}

const PATH_RUN_RE = /[^\s"'()<>[\]{}=,`?#]*(?:[?#][^\s"'()<>[\]{},`]*)?/g
const IMAGE_PATH_RE = new RegExp(`\\.(?:${IMAGE_EXTENSIONS.join('|')})(?:[?#].*)?$`, 'i')

/**
 * The relative paths of images left in a text, read apart from
 * `deckImageSources`, on the lines of prose and of the front matter: each run
 * of characters without a space, a quote, a bracket, a brace, `=`, `,` or a
 * backquote, `=` admitted after a `?` or a `#`, that ends with the extension
 * of an accepted type, with or without a query or a fragment, and that
 * `classifyImageSource` reads as local.
 */
export function leftImagePaths(text: string): ImagePath[] {
  const lines = text.split('\n')
  const frontmatter = lines.slice(1, Math.max(frontmatterLineCount(text) - 1, 0)).map((prose, index) => ({ line: index + 2, prose }))
  const paths: ImagePath[] = []
  for (const { line, prose } of [...frontmatter, ...proseLines(text)]) {
    for (const { 0: token, index: column } of prose.replace(/\r$/, '').matchAll(PATH_RUN_RE)) {
      if (token && IMAGE_PATH_RE.test(token) && classifyImageSource(token).kind === 'local')
        paths.push({ value: token, line, column, length: token.length })
    }
  }
  return paths
}

/** A text with each local image address replaced by its uploaded name, and the sources it could not replace. */
export interface ReplacedImageSources {
  text: string
  /** The local sources that are not placed, or whose front matter reads otherwise once replaced. */
  unplaced: ImageSource[]
  /** The places in `text` of the local sources it keeps as written. */
  left: TextPlace[]
}

function setIn(data: Record<string, unknown>, path: readonly string[], value: string): void {
  let target = data
  for (const key of path.slice(0, -1))
    target = target[key] as Record<string, unknown>
  target[path.at(-1)!] = value
}

/**
 * The text of a deck where each local image source is replaced at its place by
 * `/media/<name>`, the name `names` gives its path, with the query or the
 * fragment it keeps: `./icons.svg#star` becomes `/media/<name>#star`. The rest
 * of the text stays as written. The front matter of the text is read again and
 * compared to that of `raw` with the same values replaced: a difference
 * returns the local sources of the front matter as unplaced. `left` gives the
 * place in the text of each local source left as written.
 */
export function withImageSources(raw: string, names: ReadonlyMap<string, string>): ReplacedImageSources {
  const sources = deckImageSources(raw).filter(source => source.source.kind === 'local')
  const unplaced = sources.filter(source => !source.placed)
  const replaced = sources.flatMap(({ source: read, ...source }) => {
    const name = read.kind === 'local' && source.placed ? names.get(read.path) : undefined
    return name && read.kind === 'local' ? [{ source: { ...source, source: read }, value: `/media/${name}${read.suffix}` }] : []
  })
  const isReplaced = (source: ImageSource) => replaced.some(other => other.source.line === source.line && other.source.column === source.column)
  const shift = ({ line, column }: TextPlace) => replaced
    .filter(other => other.source.line === line && other.source.column < column)
    .reduce((sum, other) => sum + other.value.length - other.source.length, 0)
  const left = sources.filter(source => !isReplaced(source)).map(({ line, column, length }) => ({ line, column: column + shift({ line, column, length }), length }))
  const lines = raw.split('\n')
  for (const { source, value } of [...replaced].sort((a, b) => b.source.line - a.source.line || b.source.column - a.source.column)) {
    const text = lines[source.line - 1]!
    lines[source.line - 1] = text.slice(0, source.column) + value + text.slice(source.column + source.length)
  }
  const text = lines.join('\n')
  const inFrontmatter = replaced.filter(({ source }) => source.key)
  if (inFrontmatter.length) {
    const expected = structuredClone(splitFrontmatter(raw).data)
    for (const { source, value } of inFrontmatter)
      setIn(expected, source.key!, value)
    if (JSON.stringify(splitFrontmatter(text).data) !== JSON.stringify(expected))
      return { text, unplaced: [...unplaced, ...inFrontmatter.map(({ source }) => ({ ...source, placed: false }))], left }
  }
  return { text, unplaced, left }
}
