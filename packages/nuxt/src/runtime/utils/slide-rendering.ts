import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc'
import type { Slide } from '../types/presentation.ts'
import htmlTags from '@nuxtjs/mdc/runtime/parser/utils/html-tags-list'
import { bindingPath, buildComponentMap, componentKey, deckAttributes, surfaceLevel } from '@vignettes/core/deck'
import { resolveSlideBackground } from '@vignettes/core/render'

export { resolveSlideBackground }

// Elements in which an unknown component keeps its content inline.
const INLINE_PARENTS = new Set(['p', 'span', 'a', 'strong', 'em', 'b', 'i', 'small', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * The names the slides render as components: the registered ones, aliases
 * included, and the headings, which render as plain elements so a host's prose
 * components (the anchored headings of a documentation site) leave the slide
 * titles to the theme.
 */
export function knownComponentNames(): string[] {
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', ...Object.keys(buildComponentMap())]
}

// Elements that load another document or change the page around the slide;
// MDC renders them from raw HTML. A raw `iframe` renders as the `Iframe`
// component, which MDC maps to its tag unless the node carries `__ignoreMap`:
// MDC sets that prop on the `code` of a code block alone.
const REFUSED_TAGS = new Set(['frame', 'frameset', 'embed', 'object', 'portal', 'base', 'meta', 'link', 'style', 'form'])

/**
 * A node as a slide may draw it: its attributes as `deckAttributes` keeps them,
 * a `{{ … }}` binding that reads the deck's data, and none of `REFUSED_TAGS`.
 */
function safeNode(node: MDCNode): MDCNode | undefined {
  if (node.type !== 'element')
    return node
  if (REFUSED_TAGS.has(node.tag.toLowerCase()))
    return undefined
  if (node.tag === 'binding' && !bindingPath(String(node.props?.value ?? '')))
    return { type: 'text', value: String(node.props?.defaultValue ?? '') }
  const { __ignoreMap, ...props } = node.props ?? {}
  const kept = deckAttributes(node.tag, props)
  return { ...node, props: node.tag === 'code' && __ignoreMap !== undefined ? { __ignoreMap, ...kept } : kept }
}

/** The nodes as a slide may draw them, at every depth (see `safeNode`). */
export function safeNodes(nodes: MDCNode[]): MDCNode[] {
  return nodes.flatMap((node): MDCNode[] => {
    const safe = safeNode(node)
    if (safe?.type !== 'element')
      return safe ? [safe] : []
    return [{ ...safe, children: safeNodes(safe.children) }]
  })
}

// MDC renders `binding` itself; SVG children are absent from its HTML list.
function rendersAsIs(node: MDCElement, keys: Set<string>): boolean {
  return node.tag === 'svg' || node.tag === 'binding' || htmlTags.has(node.tag) || keys.has(componentKey(node.tag))
}

// Punctuation next to an inline `code`, with no space or with the space French
// puts there: an opening bracket or quote before it, a closing one or a mark after it.
const PUNCTUATION_BEFORE_RE = /[([{«“‘][ \u00A0\u202F]?$/
const PUNCTUATION_AFTER_RE = /^(?:[ \u00A0\u202F]?[:;!?»]+|[.,…)\]}’”'"]+)/

function textValue(node: MDCNode | undefined): string | undefined {
  return node?.type === 'text' ? node.value : undefined
}

/**
 * The children with each inline `code` and the punctuation next to it in a
 * `code-group` span, which the theme kit keeps on one line: a line break
 * leaves no mark alone at the start of a line.
 */
function groupCodeWithPunctuation(children: MDCNode[]): MDCNode[] {
  const nodes = [...children]
  const out: MDCNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const previous = textValue(out.at(-1)) ?? ''
    const next = textValue(nodes[i + 1]) ?? ''
    const before = node.type === 'element' && node.tag === 'code' ? previous.match(PUNCTUATION_BEFORE_RE)?.[0] ?? '' : ''
    const after = node.type === 'element' && node.tag === 'code' ? next.match(PUNCTUATION_AFTER_RE)?.[0] ?? '' : ''
    if (!before && !after) {
      out.push(node)
      continue
    }
    const group: MDCNode[] = [node]
    if (before) {
      out.pop()
      if (previous.length > before.length)
        out.push({ type: 'text', value: previous.slice(0, -before.length) })
      group.unshift({ type: 'text', value: before })
    }
    if (after) {
      group.push({ type: 'text', value: after })
      if (next.length > after.length)
        nodes[i + 1] = { type: 'text', value: next.slice(after.length) }
      else
        i++
    }
    out.push({ type: 'element', tag: 'span', props: { class: 'code-group' }, children: group })
  }
  return out
}

/**
 * The tree with each component outside `known` replaced by its content. MDC
 * resolves an unknown name among the global components of the host application
 * (the tabs of a documentation site, the prose of the studio), which would draw
 * the same deck differently from one host to another. Names compare as
 * `componentKey` compares them. The parser already keeps the nodes `safeNodes`
 * keeps; the renderer applies it again to the tree it receives.
 */
export function keepKnownComponents(tree: MDCRoot, known: Iterable<string>): MDCRoot {
  const keys = new Set([...known].map(componentKey))

  function visit(unsafe: MDCNode, parentTag?: string): MDCNode[] {
    const node = safeNode(unsafe)
    if (node?.type !== 'element')
      return node ? [node] : []
    if (rendersAsIs(node, keys)) {
      if (node.tag === 'svg')
        return [{ ...node, children: safeNodes(node.children) }]
      const children = visitAll(node.children, node.tag)
      return [{ ...node, children: node.tag === 'pre' ? children : groupCodeWithPunctuation(children) }]
    }
    const tag = INLINE_PARENTS.has(parentTag ?? '') ? 'span' : 'div'
    // The named slots of the component become plain content.
    const content = node.children.flatMap(child =>
      child.type === 'element' && child.tag === 'template' ? child.children : [child])
    const element: MDCElement = { type: 'element', tag, props: {}, children: visitAll(content, tag) }
    return [element]
  }

  function visitAll(nodes: MDCNode[], parentTag?: string): MDCNode[] {
    return nodes.flatMap(node => visit(node, parentTag))
  }

  return { ...tree, children: visitAll(tree.children) }
}

/** The tags of the tree that `keepKnownComponents` replaces by their content, once each. */
export function unknownComponents(tree: MDCRoot, known: Iterable<string>): string[] {
  const keys = new Set([...known].map(componentKey))
  const found = new Set<string>()
  function visit(node: MDCNode) {
    if (node.type !== 'element')
      return
    if (!rendersAsIs(node, keys))
      found.add(node.tag)
    if (node.tag !== 'svg')
      node.children.forEach(visit)
  }
  tree.children.forEach(visit)
  return [...found]
}

// "Pressé·e ? Ce qui a changé" -> { prefix: "Pressé·e ?", label: "Ce qui a changé" }; null if no " ? ".
export function quicklinkParts(text: string): { prefix: string, label: string } | null {
  const idx = text.indexOf(' ? ')
  if (idx === -1)
    return null
  return { prefix: text.slice(0, idx + 2), label: text.slice(idx + 3) }
}

export function getSlideClasses(slide: Pick<Slide, 'headingLevel' | 'section' | 'layout' | 'fullSlide'>): string[] {
  const classes: string[] = []
  const surface = surfaceLevel(slide)
  if (surface)
    classes.push(`slide-${surface}`)
  if (slide.fullSlide)
    classes.push('layout-full')
  const media = slide.layout?.media
  if (media) {
    classes.push('layout-media', `layout-media-${media.placement}`)
    if (media.size)
      classes.push(`media-size-${media.size.replace('/', '-')}`)
    if (media.placement === 'behind')
      classes.push(media.veil === undefined ? 'media-card' : 'media-veil')
  }
  if (slide.layout?.screen)
    classes.push('layout-screen')
  if (slide.layout?.heading)
    classes.push(`heading-${slide.layout.heading}`)
  if (slide.layout?.align)
    classes.push(`align-${slide.layout.align}`)
  if (slide.layout?.text)
    classes.push(`text-size-${slide.layout.text}`)
  if (slide.layout?.inset)
    classes.push(`inset-${slide.layout.inset}`)
  return classes
}

function uniqueKeys(slides: readonly Slide[], fallback: (index: number) => string): string[] {
  const seen = new Map<string, number>()
  return slides.map((slide, index) => {
    const base = slide.key ?? fallback(index)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}~${count}` : base
  })
}

/**
 * The keys of the sections and of their vertical slides: a slide keeps its
 * components while its source text stays the same, and the second slide with
 * the same text takes the next key. Two slides of the same text share one
 * parsed object, so the keys go by position.
 */
export function slideKeys(sections: readonly Slide[]): { sections: string[], vertical: string[][] } {
  return {
    sections: uniqueKeys(sections, index => `h${index}`),
    vertical: sections.map((section, index) => uniqueKeys(section.verticalSlides ?? [], vIndex => `h${index}v${vIndex}`)),
  }
}
