// The two implementations of the `DeckParser` port: headings and separators.

import type { MDCParserResult } from '@nuxtjs/mdc'
import type { DeckParser, ParseOptions, Slide, SlideSource } from '@vignettes/core/deck'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import {
  BACKGROUND_ANNOTATION_TAG,
  codeLines,
  fullSlideComponentNames,
  HTML_REWRITTEN_COMPONENT_TAGS,
  isLinkDefinition,
  isSectionSlide,
  legacyComponentLayout,
  readLayout,
  splitSlides,
  STRIPPED_ANNOTATION_TAGS,
} from '@vignettes/core/deck'
import { safeNodes } from './slide-rendering.ts'
import { writeSourcePositions } from './source-positions.ts'

// Renames the MDC components whose tag the HTML pass would rewrite.
function remarkRewrittenComponentTags() {
  return (tree: any) => {
    const rename = (node: any) => {
      if (['containerComponent', 'leafComponent', 'textComponent'].includes(node.type)) {
        const tag = HTML_REWRITTEN_COMPONENT_TAGS[String(node.name).toLowerCase()]
        if (tag) {
          node.name = tag
          if (node.data?.hName)
            node.data.hName = tag
        }
      }
      node.children?.forEach(rename)
    }
    rename(tree)
  }
}

function parseDeckMarkdown(md: string, keepPosition = false): Promise<MDCParserResult> {
  return parseMarkdown(md, {
    remark: { plugins: { 'rewritten-component-tags': { instance: remarkRewrittenComponentTags } } },
    keepPosition,
  })
}

export function getHeadingLevel(children: any[]): string | undefined {
  if (!children || children.length === 0)
    return undefined
  const firstHeading = children.find((node: any) =>
    node.type === 'element' && /^h[1-6]$/.test(node.tag),
  )
  return firstHeading?.tag
}

// Paragraph with only italic text — treated as a subtitle.
function isItalicParagraph(node: any): boolean {
  if (node.type !== 'element' || node.tag !== 'p')
    return false
  const children = node.children || []
  return children.length === 1 && children[0].type === 'element' && children[0].tag === 'em'
}

function hasFullSlideComponent(children: any[]): boolean {
  return children.some(node =>
    (node.type === 'element' && fullSlideComponentNames().includes(node.tag))
    || (node.children && hasFullSlideComponent(node.children)))
}

function extractBackgroundOverride(children: any[]): string | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === BACKGROUND_ANNOTATION_TAG && n.props?.image)
  return node?.props.image
}

// A component of the earlier format that laid a media beside or behind the
// text (see `legacyComponentLayout`) gives its attributes to the slide layout
// and leaves its text in the slide.
function unwrapLegacyMedia(children: any[]): { children: any[], attributes?: Record<string, unknown> } {
  const index = children.findIndex(n => n.type === 'element' && legacyComponentLayout(n.tag, n.props ?? {}))
  if (index === -1)
    return { children }
  const node = children[index]
  return {
    children: [...children.slice(0, index), ...(node.children ?? []), ...children.slice(index + 1)],
    attributes: legacyComponentLayout(node.tag, node.props ?? {}),
  }
}

function filterBackgroundNodes(children: any[]): any[] {
  return children.filter(n => !(n.type === 'element' && n.tag === BACKGROUND_ANNOTATION_TAG))
}

function extractPretitle(children: any[]): any | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === 'pretitle' && n.props?.text)
  if (!node)
    return undefined
  return {
    type: 'root',
    children: [{ type: 'element', tag: 'p', props: {}, children: [{ type: 'text', value: node.props.text }] }],
  }
}

function extractExplicitSubtitle(children: any[]): any | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === 'subtitle' && n.props?.text)
  if (!node)
    return undefined
  return {
    type: 'root',
    children: [{ type: 'element', tag: 'p', props: {}, children: [{ type: 'text', value: node.props.text }] }],
  }
}

function extractQuicklink(children: any[]): { text: string, href: string } | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === 'quicklink' && n.props?.text && n.props?.href)
  if (!node)
    return undefined
  return { text: node.props.text, href: node.props.href }
}

function extractLayoutAttributes(children: any[]): Record<string, unknown> | undefined {
  return children.find(n => n.type === 'element' && n.tag === 'layout')?.props
}

// The :slide-background tag is filtered separately by filterBackgroundNodes().
function filterAnnotationNodes(children: any[]): any[] {
  return children.filter(n =>
    !(n.type === 'element' && STRIPPED_ANNOTATION_TAGS.includes(n.tag)),
  )
}

/**
 * Builds a Slide: first heading -> `header`, rest -> `body`; supports :pretitle,
 * :subtitle, :layout, :quicklink. A FULL_SLIDE_COMPONENT on a slide without a
 * media keeps all children in `body` with no header/body split.
 */
export function createSlide(children: any[], headingLevel?: string): Slide {
  const backgroundImage = extractBackgroundOverride(children)
  const withoutBackground = filterBackgroundNodes(children)
  const layoutAttributes = extractLayoutAttributes(withoutBackground)
  const legacy = layoutAttributes ? { children: withoutBackground } : unwrapLegacyMedia(withoutBackground)
  const filtered = legacy.children
  const level = headingLevel || getHeadingLevel(filtered)

  const attributes = layoutAttributes ?? legacy.attributes
  const layout = attributes ? readLayout(attributes).layout : undefined
  const pretitle = extractPretitle(filtered)
  const explicitSubtitle = extractExplicitSubtitle(filtered)
  const quicklink = extractQuicklink(filtered)
  const cleaned = filterAnnotationNodes(filtered)
  const shared = {
    headingLevel: level,
    ...(layout?.media || layout?.heading || layout?.align || layout?.screen ? { layout } : {}),
    backgroundImage,
    quicklink,
  }

  if (!layout?.media && hasFullSlideComponent(cleaned))
    return { body: { type: 'root', children: cleaned }, fullSlide: true, ...shared }

  const firstHeadingIndex = cleaned.findIndex((node: any) =>
    node.type === 'element' && /^h[1-6]$/.test(node.tag),
  )

  if (firstHeadingIndex !== -1) {
    let subtitle: any = explicitSubtitle
    let bodyStartIndex = firstHeadingIndex + 1

    // Fallback: italic paragraph immediately after heading.
    if (!subtitle) {
      const next = cleaned[firstHeadingIndex + 1]
      if (next && isItalicParagraph(next)) {
        subtitle = { type: 'root', children: [next] }
        bodyStartIndex = firstHeadingIndex + 2
      }
    }

    return {
      header: { type: 'root', children: [cleaned[firstHeadingIndex]] },
      pretitle,
      subtitle,
      body: {
        type: 'root',
        children: [
          ...cleaned.slice(0, firstHeadingIndex),
          ...cleaned.slice(bodyStartIndex),
        ],
      },
      ...shared,
    }
  }

  return { body: { type: 'root', children: cleaned }, ...shared }
}

// The leading newline keeps MDC from reading a slide that opens on a thematic
// break as frontmatter; the frontmatter is split off before the slides. It also
// gives the first node a position, which MDC leaves out at offset 0.
async function parseChunk(text: string, definitions = '', options: ParseOptions = {}): Promise<any[]> {
  const parsed = `\n${text.trim()}${definitions}`
  const ast = await parseDeckMarkdown(parsed, options.sourcePositions)
  const nodes = safeNodes(ast.body?.children ?? [])
  if (!options.sourcePositions)
    return nodes
  // An offset of `parsed` is one past the leading newline, and as far from the
  // start of the slide text as the blanks `trim` removed.
  const leading = text.length - text.trimStart().length
  return writeSourcePositions(nodes, parsed, leading - 1)
}

/**
 * The link reference definitions of the whole deck, appended to each slide of a
 * heading deck so a `[text][ref]` resolves wherever its definition sits.
 */
function linkDefinitions(raw: string): string {
  const code = codeLines(raw)
  const found = raw.split('\n').filter((line, index) => !code.has(index) && isLinkDefinition(line)).map(line => line.trim())
  return found.length ? `\n\n${found.join('\n')}` : ''
}

/** The slides of one horizontal position, as `splitSlides` cut them. */
function groupByPosition(sources: readonly SlideSource[]): SlideSource[][] {
  const groups: SlideSource[][] = []
  for (const source of sources)
    (groups[source.h] ??= []).push(source)
  return groups
}

/** FNV-1a hash of a text, in base 36. */
function fingerprint(text: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(36)
}

// The slide of one source, marked when it is a section.
async function parseSourceSlide(text: string, definitions?: string, options?: ParseOptions): Promise<{ children: any[], slide: Slide }> {
  const children = await parseChunk(text, definitions, options)
  const slide = { ...createSlide(children), key: fingerprint(text) }
  return { children, slide: isSectionSlide(text) ? { ...slide, section: true } : slide }
}

// The editor parses the deck again at each pause of the typing: a slide whose
// text is unchanged comes from this cache as the same object, which the
// renderer leaves as it is. The least recently used slide leaves the cache first.
const SLIDE_CACHE_SIZE = 500
const parsedSlides = new Map<string, Promise<{ children: any[], slide: Slide }>>()

function sourceSlide(source: SlideSource, definitions = '', options: ParseOptions = {}): Promise<{ children: any[], slide: Slide }> {
  const key = `${source.text}\u0000${definitions}\u0000${options.sourcePositions ? 'positions' : ''}`
  const cached = parsedSlides.get(key)
  if (cached) {
    parsedSlides.delete(key)
    parsedSlides.set(key, cached)
    return cached
  }
  const parsed = parseSourceSlide(source.text, definitions, options)
  parsed.catch(() => parsedSlides.delete(key))
  parsedSlides.set(key, parsed)
  if (parsedSlides.size > SLIDE_CACHE_SIZE)
    parsedSlides.delete(parsedSlides.keys().next().value!)
  return parsed
}

// Heading decks: a stack carries its vertical slides only.
async function headingSlide(group: SlideSource[], definitions: string, options?: ParseOptions): Promise<Slide> {
  const parts = await Promise.all(group.map(source => sourceSlide(source, definitions, options)))
  if (parts.length === 1)
    return parts[0]!.slide
  return {
    body: { type: 'root', children: [] },
    verticalSlides: parts.map(part => part.slide),
    headingLevel: getHeadingLevel(parts.flatMap(part => part.children)),
    key: fingerprint(group.map(source => source.text).join('\n')),
  }
}

// Separator decks: a stack carries its vertical slides only.
async function separatorSlide(group: SlideSource[], options?: ParseOptions): Promise<Slide> {
  const parts = await Promise.all(group.map(source => sourceSlide(source, '', options)))
  if (parts.length === 1)
    return parts[0]!.slide
  const verticalSlides = parts.map(part => part.slide)
  return {
    body: { type: 'root', children: [] },
    verticalSlides,
    headingLevel: verticalSlides[0]?.headingLevel,
    key: fingerprint(group.map(source => source.text).join('\n')),
  }
}

// Both parsers behind the shared `DeckParser` port: `splitSlides` of
// `@vignettes/core` cuts the markdown, MDC parses each slide.
export const headingParser: DeckParser = {
  id: 'heading',
  parse(raw: string, _meta?: unknown, options?: ParseOptions): Promise<Slide[]> {
    const definitions = linkDefinitions(raw)
    return Promise.all(groupByPosition(splitSlides(raw, 'heading')).map(group => headingSlide(group, definitions, options)))
  },
}

export const separatorParser: DeckParser = {
  id: 'separator',
  parse(raw: string, _meta?: unknown, options?: ParseOptions): Promise<Slide[]> {
    return Promise.all(groupByPosition(splitSlides(raw, 'separator')).map(group => separatorSlide(group, options)))
  },
}

export const PARSERS = {
  heading: headingParser,
  separator: separatorParser,
} as const
