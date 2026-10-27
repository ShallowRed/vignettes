/**
 * The component and annotation contract of the deck dialect, as data.
 */

/** A text in each interface language, by language code (`fr`, `en`). */
export type LocalizedText = Readonly<Record<string, string>>

/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */

/**
 * A `:tag{...}` directive the parser extracts into the `Slide` and removes from
 * the body. Its snippet is the text an editor inserts, with `${…}` placeholders
 * to tab through.
 */
export interface DeckAnnotation {
  tag: string
  snippet: LocalizedText
  description: LocalizedText
  /** The attributes that take the address of an image, which may be a `data:image` URL (see `isDeckUrl`). */
  images?: readonly string[]
}

export const DECK_ANNOTATIONS: readonly DeckAnnotation[] = [
  {
    tag: 'slide-background',
    images: ['image'],
    snippet: { fr: ':slide-background{image="${/backgrounds/exemple.svg}"}', en: ':slide-background{image="${/backgrounds/example.svg}"}' },
    description: { fr: 'Image de fond propre à cette diapositive (attribut image)', en: 'Background image of this slide (attribute image)' },
  },
  {
    tag: 'pretitle',
    snippet: { fr: ':pretitle{text="${Contexte}"}', en: ':pretitle{text="${Context}"}' },
    description: { fr: 'Texte au-dessus du titre (attribut text)', en: 'Text above the title (attribute text)' },
  },
  {
    tag: 'subtitle',
    snippet: { fr: ':subtitle{text="${Sous-titre}"}', en: ':subtitle{text="${Subtitle}"}' },
    description: { fr: 'Texte sous le titre (attribut text)', en: 'Text below the title (attribute text)' },
  },
  {
    tag: 'layout',
    snippet: { fr: ':layout{media="${right}" src="${/images/placeholder.svg}" alt="${Description}"}', en: ':layout{media="${right}" src="${/images/placeholder.svg}" alt="${Description}"}' },
    description: { fr: 'Mise en page de la diapositive : un média à côté, au-dessus, au-dessous ou derrière le texte (attributs media, size, src, story, fit, position, heading…)', en: 'Layout of the slide: a media beside, above, below or behind the text (attributes media, size, src, story, fit, position, heading…)' },
  },
  {
    tag: 'quicklink',
    snippet: { fr: ':quicklink{text="${Voir la démo}" href="${https://exemple.fr}"}', en: ':quicklink{text="${See the demo}" href="${https://example.com}"}' },
    description: { fr: 'Lien épinglé en bas de la diapositive (attributs text, href)', en: 'Link pinned to the bottom of the slide (attributes text, href)' },
  },
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
  /**
   * The text an editor inserts, as for an annotation. The editor offers the
   * components that have one; a component written inside another (`Column`,
   * `Step`) comes with the snippet of its parent.
   */
  snippet?: LocalizedText
  description?: LocalizedText
  /** The props that take the address of an image, which may be a `data:image` URL (see `isDeckUrl`). */
  images?: readonly string[]
}

/** The speaker notes, which the audience never sees. */
export const NOTES_COMPONENT = 'Notes'

/** The components the render layer ships. */
export const BUILT_IN_COMPONENTS: readonly DeckComponent[] = [
  {
    name: 'Quote',
    images: ['avatar'],
    snippet: { fr: '::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation.}\n::', en: '::Quote{author="${Author}" role="${Role}"}\n${The quote.}\n::' },
    description: { fr: 'Citation avec auteur, rôle et avatar optionnels', en: 'Quote with optional author, role and avatar' },
  },
  {
    name: 'Iframe',
    snippet: { fr: '::Iframe{src="${https://exemple.fr}" title="${Titre}"}\n::', en: '::Iframe{src="${https://example.com}" title="${Title}"}\n::' },
    description: { fr: 'Page web intégrée (attributs lightbox, fullwidth)', en: 'Embedded web page (attributes lightbox, fullwidth)' },
  },
  {
    name: 'Image',
    aliases: ['deck-image'],
    images: ['src'],
    snippet: { fr: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::', en: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::' },
    description: { fr: 'Image avec cadrage (attributs fit, position, rounded, shadow)', en: 'Image with framing (attributes fit, position, rounded, shadow)' },
  },
  {
    name: 'Mermaid',
    snippet: { fr: '::Mermaid\n```mermaid\nflowchart LR\n    A[${Départ}] --> B[${Arrivée}]\n```\n::', en: '::Mermaid\n```mermaid\nflowchart LR\n    A[${Start}] --> B[${End}]\n```\n::' },
    description: { fr: 'Diagramme Mermaid (flowchart, sequence…)', en: 'Mermaid diagram (flowchart, sequence…)' },
  },
  {
    name: 'IconInline',
    aliases: ['i'],
    snippet: { fr: ':i{name="${ri:home-line}"}', en: ':i{name="${ri:home-line}"}' },
    description: { fr: 'Icône dans le texte (Remix / Iconify)', en: 'Inline icon (Remix / Iconify)' },
  },
  {
    name: 'Columns',
    aliases: ['TwoColumns', 'ThreeColumns'],
    snippet: { fr: ':::Columns\n::Column\n${Colonne 1}\n::\n::Column\n${Colonne 2}\n::\n:::', en: ':::Columns\n::Column\n${Column 1}\n::\n::Column\n${Column 2}\n::\n:::' },
    description: { fr: 'Colonnes côte à côte (::Column, attribut span pour les largeurs)', en: 'Side-by-side columns (::Column, attribute span for the widths)' },
  },
  { name: 'Column', aliases: ['column'] },
  {
    name: 'Highlight',
    snippet: { fr: '::Highlight{size="${sm}"}\n${Message clé.}\n::', en: '::Highlight{size="${sm}"}\n${Key message.}\n::' },
    description: { fr: 'Encadré de mise en avant (attributs size sm ou md, variant)', en: 'Highlight box (attributes size sm or md, variant)' },
  },
  {
    name: NOTES_COMPONENT,
    aliases: ['notes'],
    snippet: { fr: '::Notes\n${Ce que dit l\'orateur.}\n::', en: '::Notes\n${What the speaker says.}\n::' },
    description: { fr: 'Notes de l\'orateur, visibles dans la vue conférencier (touche S)', en: 'Speaker notes, shown in the speaker view (S key)' },
  },
  {
    name: 'Fragments',
    aliases: ['fragments'],
    snippet: { fr: '::Fragments\n- ${Premier point}\n- ${Deuxième point}\n::', en: '::Fragments\n- ${First point}\n- ${Second point}\n::' },
    description: { fr: 'Liste dont les éléments apparaissent un par un (attributs effect, dim)', en: 'List whose items appear one at a time (attributes effect, dim)' },
  },
] as const
/* eslint-enable no-template-curly-in-string */

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

/**
 * The form a component name compares in: MDC resolves `two-columns` and
 * `TwoColumns` to the same component, so the comparison ignores case and hyphens.
 */
export function componentKey(name: string): string {
  return name.replaceAll('-', '').toLowerCase()
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
