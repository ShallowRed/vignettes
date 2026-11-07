import type { DeckComponent, MediaPlacement, MediaSize, Slide } from '@vignettes/core/deck'
import { bindingPath, columnGroups, componentKey, deckComponentNamed, inLanguage, isDeckUrl, surfaceLevel, urlKindOf } from '@vignettes/core/deck'
import { behindMedia, buildStoryUrl, deckLanguage, resolveSlideMedia } from '@vignettes/core/render'

/**
 * The components of the deck contract that the writer writes as PowerPoint
 * elements. Any other registered component becomes a frame: a rectangle with
 * its label and, when it has the address of a page, a link to it.
 */
export const NATIVE_COMPONENTS: readonly string[] = ['Columns', 'Column', 'Fragments', 'Highlight', 'IconInline', 'Image', 'Notes', 'Quote']

const NATIVE = new Set(NATIVE_COMPONENTS.map(componentKey))

/** A run of text with one style. */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
  /** A line break after the text. */
  newline?: boolean
}

export type ParagraphKind = 'text' | 'heading' | 'item' | 'quote' | 'highlight' | 'subtitle' | 'caption'

export interface Paragraph {
  kind: ParagraphKind
  runs: Run[]
  /** For a list item: its depth from 0, and whether its list is numbered. */
  level?: number
  ordered?: boolean
}

export interface Frame {
  label: string
  href?: string
}

export type Block
  = | { kind: 'text', paragraphs: Paragraph[] }
    | { kind: 'code', text: string }
    | { kind: 'table', rows: Run[][][] }
    | { kind: 'image', src: string, alt: string, caption: Paragraph[] }
    | { kind: 'columns', columns: Block[][] }
    | { kind: 'frame', frame: Frame }

export type SlideRole = 'title' | 'section' | 'content'

/** The surface level of the slides of each role: the class of their section and the tag of their heading. */
export const ROLE_LEVELS: Readonly<Record<SlideRole, 'h1' | 'h2' | 'h3'>> = { title: 'h1', section: 'h2', content: 'h3' }

/** The media pane of a slide: an image, or the frame of a story or a page. */
export interface PaneMedia {
  placement: Exclude<MediaPlacement, 'behind'>
  size: MediaSize
  image?: { src: string, alt: string, fit: 'cover' | 'contain' }
  frame?: Frame
}

/** What the writer puts on one slide. */
export interface SlidePlan {
  role: SlideRole
  section: boolean
  title: Run[]
  titleHidden: boolean
  pretitle: Run[]
  body: Block[]
  notes: string
  media?: PaneMedia
  /** The image of `:slide-background` or behind the text, and the share of black laid over it. */
  background?: { src: string, veil?: number }
  quicklink?: { text: string, href?: string }
}

export interface ReadContext {
  /** The frontmatter, read for the deck's Storybook and for `{{ … }}` bindings. */
  meta: Readonly<Record<string, unknown>>
  lang: string
  resolveUrl: (url: string) => string
  transformText: (text: string) => string
}

// The characters XML 1.0 refuses: PowerPoint repairs a file that holds one.
// eslint-disable-next-line no-control-regex
const XML_REFUSED_RE = /[\u0000-\u0008\v\f\u000E-\u001F￾￿]/g

export function cleanText(text: string): string {
  return text.replace(XML_REFUSED_RE, '')
}

interface Node {
  type: string
  tag?: string
  value?: string
  props?: Record<string, unknown>
  children?: Node[]
}

const asNode = (tree: unknown): Node | undefined => tree && typeof tree === 'object' ? tree as Node : undefined
const childrenOf = (tree: unknown): Node[] => asNode(tree)?.children ?? []
const tagOf = (node: Node): string => (node.tag ?? '').toLowerCase()

/** The registered component a tag names, or none for an HTML element or an unknown name. */
function componentOf(node: Node): DeckComponent | undefined {
  return node.type === 'element' && node.tag ? deckComponentNamed(node.tag) : undefined
}

const isNative = (component: DeckComponent) => NATIVE.has(componentKey(component.name))

/** An address a link of the file may take: an `http:` or `https:` address, once resolved. */
function linkAddress(href: unknown, context: ReadContext): string | undefined {
  if (!isDeckUrl(href) || href.startsWith('#'))
    return undefined
  try {
    const resolved = context.resolveUrl(href)
    return /^https?:/i.test(resolved) ? resolved : undefined
  }
  catch {
    return undefined
  }
}

function storyLink(story: unknown, context: ReadContext): string | undefined {
  const storybook = typeof context.meta.storybook === 'string' ? context.meta.storybook : undefined
  return typeof story === 'string' ? linkAddress(buildStoryUrl(storybook, story), context) : undefined
}

/** The page a component shows: its story, its `src` or `href`, or the story of the first component inside it that shows one. */
function frameLink(node: Node, context: ReadContext): string | undefined {
  const story = storyLink(node.props?.story, context)
  if (story)
    return story
  for (const name of ['src', 'href']) {
    const value = node.props?.[name]
    if (value !== undefined && urlKindOf(node.tag ?? '', name) === 'page') {
      const link = linkAddress(value, context)
      if (link)
        return link
    }
  }
  for (const child of node.children ?? []) {
    const link = child.type === 'element' ? frameLink(child, context) : undefined
    if (link)
      return link
  }
  return undefined
}

function frameOf(node: Node, component: DeckComponent, context: ReadContext): Frame {
  const label = cleanText(inLanguage(component.label, deckLanguage(context.lang)) || component.name)
  return { label, href: frameLink(node, context) }
}

/** The value a binding reads in the deck's data at its path, as the renderer does, or its default value. */
function bindingText(node: Node, meta: Readonly<Record<string, unknown>>): string {
  const fallback = String(node.props?.defaultValue ?? '')
  const keys = bindingPath(String(node.props?.value ?? ''))
  if (!keys || keys[0] === 'component' || keys[0] === 'mdc')
    return fallback
  let value: unknown = meta
  for (const key of keys) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      return fallback
    value = (value as Record<string, unknown>)[key]
  }
  return value === undefined || value === null || typeof value === 'object' ? fallback : String(value)
}

/** The plain text of a tree, as the source writes it. */
function plainText(node: Node): string {
  if (node.type === 'text')
    return node.value ?? ''
  return (node.children ?? []).map(plainText).join('')
}

const IMAGE_TAGS = new Set(['img'])
const STYLE_TAGS: Record<string, Partial<Run>> = { strong: { bold: true }, b: { bold: true }, em: { italic: true } }

function readRuns(nodes: readonly Node[], context: ReadContext, style: Partial<Run> = {}): Run[] {
  const runs: Run[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      // A line break of the source is a space, as in the browser: in PowerPoint it would open a paragraph.
      const value = style.code ? node.value ?? '' : (node.value ?? '').replace(/\s*\n\s*/g, ' ')
      if (value)
        runs.push({ ...style, text: cleanText(style.code ? value : context.transformText(value)) })
      continue
    }
    if (node.type !== 'element')
      continue
    const tag = tagOf(node)
    const component = componentOf(node)
    if (component) {
      if (!isNative(component))
        runs.push({ ...style, text: `[${frameOf(node, component, context).label}]` })
      else if (componentKey(component.name) !== 'iconinline')
        runs.push(...readRuns(node.children ?? [], context, style))
      continue
    }
    if (STYLE_TAGS[tag])
      runs.push(...readRuns(node.children ?? [], context, { ...style, ...STYLE_TAGS[tag] }))
    else if (tag === 'code' || tag === 'pre')
      runs.push(...readRuns(node.children ?? [], context, { ...style, code: true }))
    else if (tag === 'a')
      runs.push(...readRuns(node.children ?? [], context, { ...style, href: linkAddress(node.props?.href, context) ?? style.href }))
    else if (tag === 'br')
      runs.push({ ...style, text: '', newline: true })
    else if (tag === 'binding')
      runs.push({ ...style, text: cleanText(context.transformText(bindingText(node, context.meta))) })
    else if (!IMAGE_TAGS.has(tag))
      runs.push(...readRuns(node.children ?? [], context, style))
  }
  return runs
}

/** The images written inside a paragraph, which the writer places after its text. */
function inlineImages(nodes: readonly Node[], context: ReadContext): Block[] {
  const images: Block[] = []
  for (const node of nodes) {
    if (node.type !== 'element' || componentOf(node))
      continue
    if (tagOf(node) === 'img')
      images.push(imageBlock(node.props?.src, node.props?.alt, []))
    else
      images.push(...inlineImages(node.children ?? [], context))
  }
  return images
}

function imageBlock(src: unknown, alt: unknown, caption: Paragraph[]): Block {
  const text = typeof alt === 'string' ? cleanText(alt) : ''
  if (!isDeckUrl(src, 'image'))
    return { kind: 'frame', frame: { label: text || 'Image' } }
  return { kind: 'image', src, alt: text, caption }
}

/** Keeps the text blocks together, so a run of paragraphs and lists is one text box. */
function pushParagraphs(blocks: Block[], paragraphs: Paragraph[]): void {
  if (!paragraphs.length)
    return
  const last = blocks.at(-1)
  if (last?.kind === 'text')
    last.paragraphs.push(...paragraphs)
  else
    blocks.push({ kind: 'text', paragraphs })
}

function listParagraphs(list: Node, context: ReadContext, level: number): Paragraph[] {
  const ordered = tagOf(list) === 'ol'
  const paragraphs: Paragraph[] = []
  for (const item of list.children ?? []) {
    if (item.type !== 'element' || tagOf(item) !== 'li')
      continue
    const nested = (item.children ?? []).filter(child => ['ul', 'ol'].includes(tagOf(child)))
    // The paragraphs of a loose item stay one item, a line apart.
    const runs = (item.children ?? []).filter(child => !nested.includes(child)).flatMap((child, index): Run[] => {
      const read = readRuns(tagOf(child) === 'p' ? child.children ?? [] : [child], context)
      return index > 0 && tagOf(child) === 'p' ? [{ text: '', newline: true }, ...read] : read
    })
    paragraphs.push({ kind: 'item', runs, level, ordered })
    for (const sub of nested)
      paragraphs.push(...listParagraphs(sub, context, level + 1))
  }
  return paragraphs
}

/** A block's paragraphs read with one kind, for a quote or a key message. */
function paragraphsAs(kind: ParagraphKind, nodes: readonly Node[], context: ReadContext): Paragraph[] {
  return readBlocks(nodes, context).flatMap((block) => {
    if (block.kind === 'text')
      return block.paragraphs.map(paragraph => paragraph.kind === 'item' ? paragraph : { ...paragraph, kind })
    return []
  })
}

const isColumn = (node: Node) => node.type === 'element' && componentKey(node.tag ?? '') === 'column'

/**
 * The columns of a `Columns` block, by the rule of `columnGroups`. Without
 * groups, each child is a column, as the page lays the children of the block
 * side by side.
 */
function columnsOf(node: Node): Node[][] {
  const children = (node.children ?? []).filter(child => child.type !== 'text' || (child.value ?? '').trim())
  return columnGroups(children, child => isColumn(child) ? 'column' : tagOf(child) === 'hr' ? 'rule' : ['h3', 'h4'].includes(tagOf(child)) ? 'heading' : 'other')
    ?? children.map(child => isColumn(child) ? child.children ?? [] : [child])
}

function tableRows(table: Node, context: ReadContext): Run[][][] {
  const rows: Run[][][] = []
  const visit = (node: Node) => {
    if (tagOf(node) === 'tr')
      rows.push((node.children ?? []).filter(cell => ['th', 'td'].includes(tagOf(cell))).map(cell => readRuns(cell.children ?? [], context, tagOf(cell) === 'th' ? { bold: true } : {})))
    else
      node.children?.forEach(visit)
  }
  visit(table)
  return rows
}

/** The blocks of a part of a slide body, with the speaker notes collected aside. */
function readBlocks(nodes: readonly Node[], context: ReadContext, notes: string[] = []): Block[] {
  const blocks: Block[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      if ((node.value ?? '').trim())
        pushParagraphs(blocks, [{ kind: 'text', runs: readRuns([node], context) }])
      continue
    }
    if (node.type !== 'element')
      continue
    const component = componentOf(node)
    const tag = tagOf(node)
    if (component) {
      const key = componentKey(component.name)
      if (!isNative(component))
        blocks.push({ kind: 'frame', frame: frameOf(node, component, context) })
      else if (key === 'notes')
        notes.push(notesText(node.children ?? [], context))
      else if (key === 'quote')
        pushParagraphs(blocks, quoteParagraphs(node, context))
      else if (key === 'highlight')
        pushParagraphs(blocks, paragraphsAs('highlight', node.children ?? [], context))
      else if (key === 'columns')
        blocks.push({ kind: 'columns', columns: columnsOf(node).map(column => readBlocks(column, context, notes)) })
      else if (key === 'image')
        blocks.push(imageBlock(node.props?.src, node.props?.alt, paragraphsAs('caption', node.children ?? [], context)))
      else if (key !== 'iconinline')
        readBlocks(node.children ?? [], context, notes).forEach(block => block.kind === 'text' ? pushParagraphs(blocks, block.paragraphs) : blocks.push(block))
      continue
    }
    if (tag === 'p') {
      const runs = readRuns(node.children ?? [], context)
      if (runs.some(run => run.text.trim()))
        pushParagraphs(blocks, [{ kind: 'text', runs }])
      blocks.push(...inlineImages(node.children ?? [], context))
    }
    else if (/^h[1-6]$/.test(tag)) {
      pushParagraphs(blocks, [{ kind: 'heading', runs: readRuns(node.children ?? [], context) }])
    }
    else if (tag === 'ul' || tag === 'ol') {
      pushParagraphs(blocks, listParagraphs(node, context, 0))
    }
    else if (tag === 'blockquote') {
      pushParagraphs(blocks, paragraphsAs('quote', node.children ?? [], context))
    }
    else if (tag === 'pre') {
      const code = typeof node.props?.code === 'string' ? node.props.code : plainText(node)
      blocks.push({ kind: 'code', text: cleanText(code.replace(/\n$/, '')) })
    }
    else if (tag === 'table') {
      blocks.push({ kind: 'table', rows: tableRows(node, context) })
    }
    else if (tag === 'img') {
      blocks.push(imageBlock(node.props?.src, node.props?.alt, []))
    }
    else if (tag === 'binding') {
      pushParagraphs(blocks, [{ kind: 'text', runs: readRuns([node], context) }])
    }
    else if (tag !== 'hr' && tag !== 'br') {
      readBlocks(node.children ?? [], context, notes).forEach(block => block.kind === 'text' ? pushParagraphs(blocks, block.paragraphs) : blocks.push(block))
    }
  }
  return blocks
}

function quoteParagraphs(node: Node, context: ReadContext): Paragraph[] {
  const paragraphs = paragraphsAs('quote', node.children ?? [], context)
  const by = [node.props?.author, node.props?.role].filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
  if (by.length)
    paragraphs.push({ kind: 'caption', runs: [{ text: cleanText(context.transformText(by.join(', '))) }] })
  return paragraphs
}

/** The speaker notes as plain text: a paragraph per line, a list item after a dash. */
function notesText(nodes: readonly Node[], context: ReadContext, depth = 0): string {
  const text = (children: readonly Node[]) => runsText(readRuns(children, context))
  const lines: string[] = []
  for (const node of nodes) {
    const tag = tagOf(node)
    if (tag === 'ul' || tag === 'ol') {
      for (const item of node.children ?? []) {
        if (tagOf(item) !== 'li')
          continue
        const nested = (item.children ?? []).filter(child => ['ul', 'ol'].includes(tagOf(child)))
        lines.push(`${'  '.repeat(depth)}- ${text((item.children ?? []).filter(child => !nested.includes(child)))}`)
        if (nested.length)
          lines.push(notesText(nested, context, depth + 1))
      }
    }
    else {
      const line = text([node])
      if (line)
        lines.push(line)
    }
  }
  return lines.join(depth ? '\n' : '\n\n')
}

function headingOf(header: unknown): Node | undefined {
  return childrenOf(header).find(node => node.type === 'element' && /^h[1-6]$/.test(tagOf(node)))
}

function paneMedia(slide: Slide, context: ReadContext): PaneMedia | undefined {
  const layout = slide.layout?.media
  if (!layout || layout.placement === 'behind')
    return undefined
  const storybook = typeof context.meta.storybook === 'string' ? context.meta.storybook : undefined
  const resolved = resolveSlideMedia(layout, { storybook })
  if (!resolved)
    return undefined
  // At the top or the bottom the page gives the media the height the text
  // leaves; the file, which measures no text, gives it half.
  const size = layout.size ?? '1/2'
  if (resolved.type === 'image')
    return { placement: layout.placement, size, image: { src: resolved.src, alt: cleanText(resolved.alt), fit: resolved.fit } }
  const component = deckComponentNamed(layout.story ? 'StoryFrame' : 'Iframe')
  const label = component ? inLanguage(component.label, deckLanguage(context.lang)) || component.name : 'Page'
  return { placement: layout.placement, size, frame: { label: cleanText(label), href: linkAddress(resolved.src, context) } }
}

/** What the writer puts on a slide of the model: a slide shown on its own, not the stack of vertical slides. */
export function readSlide(slide: Slide, context: ReadContext): SlidePlan {
  const level = surfaceLevel(slide)
  const role = (Object.keys(ROLE_LEVELS) as SlideRole[]).find(name => ROLE_LEVELS[name] === level) ?? 'content'
  const heading = headingOf(slide.header)
  const notes: string[] = []
  const body = readBlocks(childrenOf(slide.body), context, notes)
  const subtitle = childrenOf(slide.subtitle).flatMap(node => tagOf(node) === 'p' ? node.children ?? [] : [node])
  const subtitleRuns = readRuns(subtitle, context)
  if (subtitleRuns.length) {
    const first = body[0]
    const paragraph: Paragraph = { kind: 'subtitle', runs: subtitleRuns }
    if (first?.kind === 'text')
      first.paragraphs.unshift(paragraph)
    else
      body.unshift({ kind: 'text', paragraphs: [paragraph] })
  }
  const behind = behindMedia(slide)
  const backgroundSrc = behind?.src ?? (isDeckUrl(slide.backgroundImage, 'image') ? slide.backgroundImage : undefined)
  const quicklink = slide.quicklink && isDeckUrl(slide.quicklink.href)
    ? { text: cleanText(context.transformText(slide.quicklink.text)), href: linkAddress(slide.quicklink.href, context) }
    : undefined
  return {
    role,
    section: Boolean(slide.section),
    title: heading ? readRuns(heading.children ?? [], context) : [],
    titleHidden: slide.layout?.heading === 'hidden',
    pretitle: readRuns(childrenOf(slide.pretitle).flatMap(node => tagOf(node) === 'p' ? node.children ?? [] : [node]), context),
    body,
    notes: notes.filter(Boolean).join('\n\n'),
    media: paneMedia(slide, context),
    background: backgroundSrc ? { src: backgroundSrc, veil: behind?.veil } : undefined,
    quicklink,
  }
}

/** The slides a reader sees, in Reveal's order: a stack gives its vertical slides. */
export function shownSlides(slides: readonly Slide[]): Slide[] {
  return slides.flatMap(slide => slide.verticalSlides?.length ? slide.verticalSlides : [slide])
}

export function runsText(runs: readonly Run[]): string {
  return runs.map(run => run.text).join('').trim()
}
