/**
 * The component and annotation contract of the deck dialect, as data.
 */

/** A `:tag{...}` directive the parser extracts into the `Slide` and removes from the body. */
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

/** Read on its own pass: it names a background the renderer applies to the slide element. */
export const BACKGROUND_ANNOTATION_TAG = 'slide-background'

/** Annotations stripped after the background pass. */
export const STRIPPED_ANNOTATION_TAGS: readonly string[] = ANNOTATION_TAGS.filter(
  t => t !== BACKGROUND_ANNOTATION_TAG,
)

/** An MDC component authored as `::Name` / `:name`. */
export interface DeckComponent {
  name: string
  /** Vue component this resolves to, when it differs from the authoring name. */
  component?: string
  /** Other authoring names for the same component. */
  aliases?: readonly string[]
  /** Takes the whole slide content area, so the parser keeps every child in `body`. */
  fullSlide?: boolean
}

/** The components the render layer ships. */
export const BUILT_IN_COMPONENTS: readonly DeckComponent[] = [
  { name: 'Quote' },
  { name: 'FullScreenImage', aliases: ['full-screen-image'], fullSlide: true },
  { name: 'Iframe' },
  { name: 'Image', aliases: ['deck-image'] },
  { name: 'Mermaid' },
  { name: 'PreviewLink' },
  { name: 'IconInline', aliases: ['i'] },
  { name: 'Columns', aliases: ['TwoColumns', 'ThreeColumns'] },
  { name: 'Highlight' },
  { name: 'Notes', aliases: ['notes'] },
  { name: 'Fragments', aliases: ['fragments'] },
] as const

/**
 * Component names the HTML pass of the MDC parser rewrites, mapped to the tag the
 * slide parser renames them to before that pass. HTML parsing turns an `image`
 * start tag into `img`, a void element, so `::Image` would lose its component and
 * its slot. Each target tag is an alias of the component in the contract.
 */
export const HTML_REWRITTEN_COMPONENT_TAGS: Readonly<Record<string, string>> = {
  image: 'deck-image',
}

let registry: DeckComponent[] = [...BUILT_IN_COMPONENTS]

/**
 * Add components to the contract. An extension package or a tenant calls this
 * before a deck is parsed or rendered, so its own `::Name` resolves and the
 * parser knows whether it takes the whole slide. Re-registering a name replaces
 * its entry.
 */
export function registerDeckComponents(components: readonly DeckComponent[]): void {
  const added = new Set(components.map(c => c.name))
  registry = [...registry.filter(c => !added.has(c.name)), ...components]
}

/** Back to the components the render layer ships. */
export function resetDeckComponents(): void {
  registry = [...BUILT_IN_COMPONENTS]
}

export function deckComponents(): readonly DeckComponent[] {
  return registry
}

/** `{ authoringName: VueComponent }`, aliases included. */
export function buildComponentMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of registry) {
    const target = c.component || c.name
    map[c.name] = target
    for (const alias of c.aliases || [])
      map[alias] = target
  }
  return map
}

/** Full-slide authoring names, canonical and aliases. */
export function fullSlideComponentNames(): string[] {
  return registry.filter(c => c.fullSlide).flatMap(c => [c.name, ...(c.aliases || [])])
}

/**
 * Normalise an icon name to the Iconify form (`ri:home-line`). Accepts the Remix
 * CSS-class form, whose first hyphen becomes the colon.
 */
export function normalizeIconName(name: string): string {
  if (name.includes(':'))
    return name
  return name.replace('-', ':')
}
