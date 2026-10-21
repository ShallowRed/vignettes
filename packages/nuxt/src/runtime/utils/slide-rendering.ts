import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc'
import type { Slide } from '../types/presentation.ts'
import htmlTags from '@nuxtjs/mdc/runtime/parser/utils/html-tags-list'
import { buildComponentMap, componentKey, deckAttributes } from '@vignettes/core/deck'
import { getMediaFit, resolveSlideBackground } from '@vignettes/core/render'

export { getMediaFit, resolveSlideBackground }

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

// The names a `{{ … }}` binding reads besides the deck's data: MDCRenderer
// (`renderBinding`) also gives it the route, the component map and its own
// functions, and calls a function it finds on the path.
const BINDING_PATH_RE = /\.|\[(\d+)\]/
const MDC_DATA_KEYS = new Set(['tags', 'runtimeData', 'updateRuntimeData'])
const OBJECT_KEYS = new Set(['constructor', 'prototype', '__proto__'])

function readsDeckData(path: string): boolean {
  const keys = path.trim().split(BINDING_PATH_RE).filter(Boolean)
  if (keys[0] === '$doc' || keys[0] === '$document')
    keys.shift()
  return keys.length > 0 && !keys[0]!.startsWith('$') && !MDC_DATA_KEYS.has(keys[0]!) && !keys.some(key => OBJECT_KEYS.has(key))
}

/**
 * A node as a slide may draw it: its attributes as `deckAttributes` keeps them,
 * a `{{ … }}` binding that reads the deck's data, and none of `REFUSED_TAGS`.
 */
function safeNode(node: MDCNode): MDCNode | undefined {
  if (node.type !== 'element')
    return node
  if (REFUSED_TAGS.has(node.tag.toLowerCase()))
    return undefined
  if (node.tag === 'binding' && !readsDeckData(String(node.props?.value ?? '')))
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
    if (rendersAsIs(node, keys))
      return [{ ...node, children: node.tag === 'svg' ? safeNodes(node.children) : visitAll(node.children, node.tag) }]
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

export function getSlideClasses(slide: Pick<Slide, 'headingLevel' | 'layout' | 'headingVisibility'>): string[] {
  const classes: string[] = []
  if (slide.headingLevel)
    classes.push(`slide-${slide.headingLevel}`)
  if (slide.layout)
    classes.push(`layout-${slide.layout}`)
  if (slide.headingVisibility)
    classes.push(`heading-${slide.headingVisibility}`)
  return classes
}
