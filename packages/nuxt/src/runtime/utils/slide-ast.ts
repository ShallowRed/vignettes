// The two implementations of the `DeckParser` port: headings and separators.

import type { MDCParserResult } from '@nuxtjs/mdc'
import type { DeckParser, Slide, SlideSource } from '@vignettes/core/deck'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import {
  BACKGROUND_ANNOTATION_TAG,
  fullSlideComponentNames,
  HTML_REWRITTEN_COMPONENT_TAGS,
  isSectionSlide,
  splitSlides,
  STRIPPED_ANNOTATION_TAGS,
} from '@vignettes/core/deck'
import { safeNodes } from './slide-rendering.ts'

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

function parseDeckMarkdown(md: string): Promise<MDCParserResult> {
  return parseMarkdown(md, {
    remark: { plugins: { 'rewritten-component-tags': { instance: remarkRewrittenComponentTags } } },
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

// 'full' when a descendant takes the whole slide.
function getSlideLayout(children: any[]): string | undefined {
  for (const node of children) {
    if (node.type === 'element' && fullSlideComponentNames().includes(node.tag))
      return 'full'
    if (node.children) {
      const childLayout = getSlideLayout(node.children)
      if (childLayout)
        return childLayout
    }
  }
  return undefined
}

function extractBackgroundOverride(children: any[]): string | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === BACKGROUND_ANNOTATION_TAG && n.props?.image)
  return node?.props.image
}

// `FullScreenImage` sets the slide background, which Reveal spreads over the
// whole screen and the whole printed page; the component keeps the text over it.
const FULL_SCREEN_IMAGE_TAGS = ['FullScreenImage', 'full-screen-image']

function findFullScreenImage(children: any[]): any | undefined {
  for (const node of children) {
    if (node.type === 'element' && FULL_SCREEN_IMAGE_TAGS.includes(node.tag) && node.props?.src)
      return node
    const nested = node.children && findFullScreenImage(node.children)
    if (nested)
      return nested
  }
  return undefined
}

function overlayOf(node: any): number | undefined {
  const value = Number.parseFloat(node?.props?.overlay)
  return value > 0 ? Math.min(value, 1) : undefined
}

const HEADING_VISIBILITIES = ['hidden', 'print'] as const

function headingVisibilityOf(node: any): Slide['headingVisibility'] {
  const value = node?.props?.heading
  return HEADING_VISIBILITIES.includes(value) ? value : undefined
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

function extractLayout(children: any[]): { name: string, props: Record<string, string> } | undefined {
  const node = children.find(n => n.type === 'element' && n.tag === 'layout' && n.props?.name)
  if (!node)
    return undefined
  const { name, ...rest } = node.props
  return { name, props: rest }
}

// The :slide-background tag is filtered separately by filterBackgroundNodes().
function filterAnnotationNodes(children: any[]): any[] {
  return children.filter(n =>
    !(n.type === 'element' && STRIPPED_ANNOTATION_TAGS.includes(n.tag)),
  )
}

/**
 * Builds a Slide: first heading -> `header`, rest -> `body`; supports :pretitle,
 * :subtitle, :layout, :quicklink. A detected FULL_SLIDE_COMPONENT (without an
 * explicit :layout{}) keeps all children in `body` with no header/body split.
 */
export function createSlide(children: any[], headingLevel?: string): Slide {
  const level = headingLevel || getHeadingLevel(children)

  const fullScreenImage = findFullScreenImage(children)
  const backgroundImage = extractBackgroundOverride(children) ?? fullScreenImage?.props.src
  const backgroundOverlay = overlayOf(fullScreenImage)
  const headingVisibility = headingVisibilityOf(fullScreenImage)
  const filtered = filterBackgroundNodes(children)

  const layoutInfo = extractLayout(filtered)
  const pretitle = extractPretitle(filtered)
  const explicitSubtitle = extractExplicitSubtitle(filtered)
  const quicklink = extractQuicklink(filtered)
  const cleaned = filterAnnotationNodes(filtered)

  if (!layoutInfo) {
    const fullLayout = getSlideLayout(cleaned)
    if (fullLayout) {
      return {
        body: { type: 'root', children: cleaned },
        headingLevel: level,
        layout: fullLayout,
        backgroundImage,
        backgroundOverlay,
        headingVisibility,
        quicklink,
      }
    }
  }

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
      headingLevel: level,
      layout: layoutInfo?.name,
      layoutProps: layoutInfo?.props,
      backgroundImage,
      backgroundOverlay,
      headingVisibility,
      quicklink,
    }
  }

  return {
    body: { type: 'root', children: cleaned },
    headingLevel: level,
    layout: layoutInfo?.name,
    layoutProps: layoutInfo?.props,
    backgroundImage,
    backgroundOverlay,
    headingVisibility,
    quicklink,
  }
}

// The leading newline keeps MDC from reading a slide that opens on a thematic
// break as frontmatter; the frontmatter is split off before the slides.
async function parseChunk(text: string, definitions = ''): Promise<any[]> {
  const ast = await parseDeckMarkdown(`\n${text.trim()}${definitions}`)
  return safeNodes(ast.body?.children ?? [])
}

const FENCE_RE = /^ {0,3}(?:`{3,}|~{3,})/
const LINK_DEFINITION_RE = /^ {0,3}\[[^\]^][^\]]*\]:\s*\S/

/**
 * The link reference definitions of the whole deck, appended to each slide of a
 * heading deck so a `[text][ref]` resolves wherever its definition sits.
 */
function linkDefinitions(raw: string): string {
  const found: string[] = []
  let inFence = false
  for (const line of raw.split('\n')) {
    if (FENCE_RE.test(line))
      inFence = !inFence
    else if (!inFence && LINK_DEFINITION_RE.test(line))
      found.push(line.trim())
  }
  return found.length ? `\n\n${found.join('\n')}` : ''
}

/** The slides of one horizontal position, as `splitSlides` cut them. */
function groupByPosition(sources: SlideSource[]): SlideSource[][] {
  const groups: SlideSource[][] = []
  for (const source of sources)
    (groups[source.h] ??= []).push(source)
  return groups
}

// The slide of one source, marked when it is a section.
async function sourceSlide(source: SlideSource, definitions?: string): Promise<{ children: any[], slide: Slide }> {
  const children = await parseChunk(source.text, definitions)
  const slide = createSlide(children)
  return { children, slide: isSectionSlide(source.text) ? { ...slide, section: true } : slide }
}

// Heading decks: a stack carries its vertical slides only.
async function headingSlide(group: SlideSource[], definitions: string): Promise<Slide> {
  const parts = await Promise.all(group.map(source => sourceSlide(source, definitions)))
  if (parts.length === 1)
    return parts[0]!.slide
  return {
    body: { type: 'root', children: [] },
    verticalSlides: parts.map(part => part.slide),
    headingLevel: getHeadingLevel(parts.flatMap(part => part.children)),
  }
}

// Separator decks: a stack carries its vertical slides only.
async function separatorSlide(group: SlideSource[]): Promise<Slide> {
  const parts = await Promise.all(group.map(source => sourceSlide(source)))
  if (parts.length === 1)
    return parts[0]!.slide
  const verticalSlides = parts.map(part => part.slide)
  return {
    body: { type: 'root', children: [] },
    verticalSlides,
    headingLevel: verticalSlides[0]?.headingLevel,
  }
}

// Both parsers behind the shared `DeckParser` port: `splitSlides` of
// `@vignettes/core` cuts the markdown, MDC parses each slide.
export const headingParser: DeckParser = {
  id: 'heading',
  parse(raw: string): Promise<Slide[]> {
    const definitions = linkDefinitions(raw)
    return Promise.all(groupByPosition(splitSlides(raw, 'heading')).map(group => headingSlide(group, definitions)))
  },
}

export const separatorParser: DeckParser = {
  id: 'separator',
  parse(raw: string): Promise<Slide[]> {
    return Promise.all(groupByPosition(splitSlides(raw, 'separator')).map(separatorSlide))
  },
}

export const PARSERS = {
  heading: headingParser,
  separator: separatorParser,
} as const
