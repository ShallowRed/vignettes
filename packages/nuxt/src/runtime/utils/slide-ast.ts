// The two implementations of the `DeckParser` port: headings and separators.

import type { MDCParserResult } from '@nuxtjs/mdc'
import type { DeckParser, Slide } from '@vignettes/core/deck'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import {
  BACKGROUND_ANNOTATION_TAG,
  fullSlideComponentNames,
  HTML_REWRITTEN_COMPONENT_TAGS,
  STRIPPED_ANNOTATION_TAGS,
} from '@vignettes/core/deck'

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

// Splits children into vertical slides at each H3 boundary; returns a plain
// Slide when only one section results.
export function processVerticalSlides(children: any[], sectionHeadingLevel?: string): Slide {
  if (!children || children.length === 0)
    return createSlide([], sectionHeadingLevel)

  const verticalSlides: Slide[] = []
  let current: any[] = []

  for (const node of children) {
    if (node.type === 'element' && node.tag === 'h3' && current.length > 0) {
      verticalSlides.push(createSlide(current))
      current = []
    }
    current.push(node)
  }
  if (current.length > 0)
    verticalSlides.push(createSlide(current))

  if (verticalSlides.length > 1) {
    return {
      body: { type: 'root', children },
      verticalSlides,
      headingLevel: sectionHeadingLevel || getHeadingLevel(children),
    }
  }

  return createSlide(children, sectionHeadingLevel)
}

// Splits an MDC AST by H1 (title), H2/HR (horizontal), then H3 (vertical).
export function parseSlides(ast: MDCParserResult): Slide[] {
  if (!ast.body?.children)
    return []

  const sections: any[][] = []
  let current: any[] = []
  let foundFirstH1 = false
  let inH1Section = false

  for (const node of ast.body.children) {
    const isH1 = node.type === 'element' && node.tag === 'h1'
    const isH2 = node.type === 'element' && node.tag === 'h2'
    const isHR = node.type === 'element' && node.tag === 'hr'

    if (isH1 && !foundFirstH1) {
      foundFirstH1 = true
      inH1Section = true
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
      current.push(node)
      continue
    }

    if (isH2 && inH1Section) {
      inH1Section = false
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
    }

    if (!inH1Section && (isH2 || isHR)) {
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
    }

    current.push(node)
  }

  if (current.length > 0)
    sections.push(current)

  return sections.map(children => processVerticalSlides(children))
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length) : content
}

// Splits raw markdown by --- (horizontal) / ---- (vertical), parsing each chunk with MDC.
export async function parseSlidesFromSeparators(rawContent: string): Promise<Slide[]> {
  const body = stripFrontmatter(rawContent)
  const horizontalSections = body.split(/^---$/m).filter(s => s.trim().length > 0)
  const slides: Slide[] = []

  for (const section of horizontalSections) {
    const verticalParts = section.split(/^----$/m).filter(s => s.trim().length > 0)

    if (verticalParts.length > 1) {
      const verticalSlides: Slide[] = []
      for (const part of verticalParts) {
        const ast = await parseDeckMarkdown(part.trim())
        if (ast.body?.children)
          verticalSlides.push(createSlide(ast.body.children))
      }
      if (verticalSlides.length > 0) {
        slides.push({
          body: { type: 'root', children: [] },
          verticalSlides,
          headingLevel: verticalSlides[0]?.headingLevel,
        })
      }
    }
    else {
      const ast = await parseDeckMarkdown(section.trim())
      if (ast.body?.children)
        slides.push(createSlide(ast.body.children))
    }
  }

  return slides
}

// Both parsers behind the shared `DeckParser` port: uniform raw-markdown input.
// The heading parser runs MDC first (frontmatter goes to `ast.data`, not the body).
export const headingParser: DeckParser = {
  id: 'heading',
  async parse(raw: string): Promise<Slide[]> {
    const ast = await parseDeckMarkdown(raw)
    return parseSlides(ast)
  },
}

export const separatorParser: DeckParser = {
  id: 'separator',
  parse(raw: string): Promise<Slide[]> {
    return parseSlidesFromSeparators(raw)
  },
}

export const PARSERS = {
  heading: headingParser,
  separator: separatorParser,
} as const
