/**
 * The single component & syntax contract. Declarative spec consumed by the slide
 * parser and the MDC component map. Pure data + pure string functions, so it
 * stays framework-free and unit-testable.
 */

/**
 * A `:tag{...}` directive the parser extracts into the `Slide` and removes from
 * the body. Deliberately NOT an MDC component — never reaches `MDCRenderer`.
 */
export interface DeckAnnotation {
  tag: string
  description: string
}

export const DECK_ANNOTATIONS: readonly DeckAnnotation[] = [
  { tag: 'slide-background', description: 'Per-slide background image override (image="…")' },
  { tag: 'pretitle', description: 'Text shown above the heading (text="…")' },
  { tag: 'subtitle', description: 'Text shown below the heading (text="…")' },
  { tag: 'layout', description: 'Slide layout + props (name="…" …props)' },
  { tag: 'quicklink', description: 'Bottom-pinned navigation link (text="…" href="…")' },
] as const

export const ANNOTATION_TAGS: readonly string[] = DECK_ANNOTATIONS.map(a => a.tag)

/**
 * Extracted on its own pass (before MDC): carries a background URL the renderer
 * applies to the slide element, not the body.
 */
export const BACKGROUND_ANNOTATION_TAG = 'slide-background'

/** Annotations stripped after the background pass. */
export const STRIPPED_ANNOTATION_TAGS: readonly string[] = ANNOTATION_TAGS.filter(
  t => t !== BACKGROUND_ANNOTATION_TAG,
)

/**
 * An MDC component authored as `::Name` / `:name`. `aliases` are alternative
 * authoring names resolving to the same component.
 */
export interface DeckComponent {
  name: string
  /** Vue component this resolves to (defaults to `name`). */
  component?: string
  aliases?: readonly string[]
  /** Occupies the whole slide content area (no header/body split). */
  fullSlide?: boolean
}

export const DECK_COMPONENTS: readonly DeckComponent[] = [
  { name: 'Quote' },
  { name: 'FullScreenImage', aliases: ['full-screen-image'], fullSlide: true },
  { name: 'Iframe' },
  { name: 'Image' },
  { name: 'Mermaid' },
  { name: 'PreviewLink' },
  { name: 'IconInline', aliases: ['i'] },
  { name: 'Columns', aliases: ['TwoColumns', 'ThreeColumns'] },
  { name: 'Highlight' },
  { name: 'StoryFrame' },
  { name: 'Screens' },
  { name: 'Notes', aliases: ['notes'] },
  { name: 'Fragments', aliases: ['fragments'] },
  { name: 'Scheme', aliases: ['scheme'] },
  { name: 'Step', aliases: ['step'] },
  { name: 'Diagram', aliases: ['diagram'] },
  { name: 'Node', component: 'DiagramNode', aliases: ['node'] },
  { name: 'Edge', component: 'DiagramEdge', aliases: ['edge'] },
  { name: 'Area', component: 'DiagramArea', aliases: ['area'] },
  { name: 'JsonTour', aliases: ['json-tour'] },
  { name: 'Zone', component: 'JsonZone', aliases: ['zone'] },
  { name: 'Tags', aliases: ['tags'] },
  { name: 'RuleCard', aliases: ['rule-card'] },
] as const

/** Build `{ authoringName: VueComponent }` from the contract (name + aliases). */
export function buildComponentMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of DECK_COMPONENTS) {
    const target = c.component || c.name
    map[c.name] = target
    for (const alias of c.aliases || [])
      map[alias] = target
  }
  return map
}

/** Full-slide component names (canonical + aliases): parser keeps children in `body`. */
export const FULL_SLIDE_COMPONENT_NAMES: readonly string[] = DECK_COMPONENTS
  .filter(c => c.fullSlide)
  .flatMap(c => [c.name, ...(c.aliases || [])])

/**
 * Normalise an icon name to Iconify format (`ri:home-line`). Accepts the Remix
 * CSS-class form (`ri-home-line`, first hyphen → colon) or an already-`:` form.
 */
export function normalizeIconName(name: string): string {
  if (name.includes(':'))
    return name
  return name.replace('-', ':')
}
