/**
 * The component and annotation contract of the deck dialect, as data.
 */

import { BUILT_IN_ATTRIBUTES } from './component-attributes.ts'

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
  /** The name an editor shows for it. */
  label: LocalizedText
  /** The icon an editor shows beside its name, as an Iconify name (`i-lucide-quote`). */
  icon?: string
  snippet: LocalizedText
  description: LocalizedText
  /** Its section on the documentation site, as a path (`/ecrire/syntaxe#les-annotations`) or a full address. */
  docs?: string
  /** The attributes that take the address of an image, which may be a `data:image` URL (see `isDeckUrl`). */
  images?: readonly string[]
}

export const DECK_ANNOTATIONS: readonly DeckAnnotation[] = [
  {
    tag: 'slide-background',
    icon: 'i-lucide-wallpaper',
    label: { fr: 'Image de fond', en: 'Background image' },
    images: ['image'],
    snippet: { fr: ':slide-background{image="${/images/placeholder.svg}"}', en: ':slide-background{image="${/images/placeholder.svg}"}' },
    description: { fr: 'Image en fond de cette diapositive', en: 'Background image of this slide' },
    docs: '/ecrire/syntaxe#les-annotations',
  },
  {
    tag: 'pretitle',
    icon: 'i-lucide-arrow-up-to-line',
    label: { fr: 'Surtitre', en: 'Pretitle' },
    snippet: { fr: ':pretitle{text="${Contexte}"}', en: ':pretitle{text="${Context}"}' },
    description: { fr: 'Texte au-dessus du titre', en: 'Text above the title' },
    docs: '/ecrire/syntaxe#les-annotations',
  },
  {
    tag: 'subtitle',
    icon: 'i-lucide-arrow-down-to-line',
    label: { fr: 'Sous-titre', en: 'Subtitle' },
    snippet: { fr: ':subtitle{text="${Sous-titre}"}', en: ':subtitle{text="${Subtitle}"}' },
    description: { fr: 'Texte sous le titre', en: 'Text below the title' },
    docs: '/ecrire/syntaxe#les-annotations',
  },
  {
    tag: 'layout',
    icon: 'i-lucide-layout-panel-left',
    label: { fr: 'Mise en page', en: 'Layout' },
    snippet: { fr: ':layout{media="${right}" src="${/images/placeholder.svg}" alt="${Description}"}', en: ':layout{media="${right}" src="${/images/placeholder.svg}" alt="${Description}"}' },
    description: { fr: 'Image, page ou story à côté, au-dessus, au-dessous ou derrière le texte', en: 'Image, page or story beside, above, below or behind the text' },
    docs: '/ecrire/syntaxe#les-mises-en-page',
  },
  {
    tag: 'quicklink',
    icon: 'i-lucide-link',
    label: { fr: 'Lien en bas', en: 'Bottom link' },
    snippet: { fr: ':quicklink{text="${Voir la démo}" href="${https://exemple.fr}"}', en: ':quicklink{text="${See the demo}" href="${https://example.com}"}' },
    description: { fr: 'Lien affiché en bas de la diapositive', en: 'Link shown at the bottom of the slide' },
    docs: '/ecrire/syntaxe#les-annotations',
  },
] as const

export const ANNOTATION_TAGS: readonly string[] = DECK_ANNOTATIONS.map(a => a.tag)

/** Read on its own pass: it names a background the renderer applies to the slide element. */
export const BACKGROUND_ANNOTATION_TAG = 'slide-background'

/** Annotations stripped after the background pass. */
export const STRIPPED_ANNOTATION_TAGS: readonly string[] = ANNOTATION_TAGS.filter(
  t => t !== BACKGROUND_ANNOTATION_TAG,
)

/** The groups of components in an editor's menus, in the order they appear. */
export const DECK_COMPONENT_GROUPS = ['text', 'media', 'diagram', 'storybook', 'slide'] as const
export type DeckComponentGroup = typeof DECK_COMPONENT_GROUPS[number]

/** An attribute of a component, as the props of its Vue file declare it. */
export interface ComponentAttribute {
  name: string
  /** The values it takes, when they form a closed set. */
  values?: readonly string[]
  /** Takes `true` or `false` only: written alone for `true`, as `:name="false"` for `false`. */
  boolean?: boolean
  /** The value its absence gives. */
  default?: string
  description: LocalizedText
}

/** An MDC component authored as `::Name` / `:name`. */
export interface DeckComponent {
  name: string
  /** The name an editor shows for it. */
  label?: LocalizedText
  /** The group an editor lists it under. */
  group?: DeckComponentGroup
  /** The icon an editor shows beside its name, as an Iconify name (`i-lucide-quote`). */
  icon?: string
  /** Its section on the documentation site, as a path (`/reference/nuxt#quote`) or a full address. */
  docs?: string
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
  /** Its attributes, which `scripts/component-reference.ts` reads from its Vue file. */
  attributes?: readonly ComponentAttribute[]
}

/** The components with the attributes that `scripts/component-reference.ts` wrote for them. */
export function withAttributes(components: readonly DeckComponent[], attributes: Readonly<Record<string, readonly ComponentAttribute[]>>): readonly DeckComponent[] {
  return components.map(component => attributes[component.name] ? { ...component, attributes: attributes[component.name] } : component)
}

/** The speaker notes, which the audience never sees. */
export const NOTES_COMPONENT = 'Notes'

/** The components the render layer ships. */
export const BUILT_IN_COMPONENTS: readonly DeckComponent[] = withAttributes([
  {
    name: 'Quote',
    icon: 'i-lucide-quote',
    label: { fr: 'Citation', en: 'Quote' },
    group: 'text',
    images: ['avatar'],
    snippet: { fr: '::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation.}\n::', en: '::Quote{author="${Author}" role="${Role}"}\n${The quote.}\n::' },
    description: { fr: 'Citation, avec son auteur', en: 'Quote, with its author' },
    docs: '/reference/nuxt#quote',
  },
  {
    name: 'Iframe',
    icon: 'i-lucide-globe',
    label: { fr: 'Page web', en: 'Web page' },
    group: 'media',
    snippet: { fr: '::Iframe{src="${https://exemple.fr}" title="${Titre}"}\n::', en: '::Iframe{src="${https://example.com}" title="${Title}"}\n::' },
    description: { fr: 'Page web affichée dans la diapositive', en: 'Web page shown in the slide' },
    docs: '/reference/nuxt#iframe',
  },
  {
    name: 'Image',
    icon: 'i-lucide-image',
    label: { fr: 'Image', en: 'Image' },
    group: 'media',
    aliases: ['deck-image'],
    images: ['src'],
    snippet: { fr: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::', en: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::' },
    description: { fr: 'Image avec sa légende', en: 'Image with its caption' },
    docs: '/reference/nuxt#image',
  },
  {
    name: 'Mermaid',
    icon: 'i-lucide-workflow',
    label: { fr: 'Schéma Mermaid', en: 'Mermaid diagram' },
    group: 'diagram',
    snippet: { fr: '::Mermaid\n```mermaid\nflowchart LR\n    A[${Départ}] --> B[${Arrivée}]\n```\n::', en: '::Mermaid\n```mermaid\nflowchart LR\n    A[${Start}] --> B[${End}]\n```\n::' },
    description: { fr: 'Schéma de boîtes et de flèches, décrit en texte', en: 'Diagram of boxes and arrows, written as text' },
    docs: '/reference/nuxt#mermaid',
  },
  {
    name: 'IconInline',
    icon: 'i-lucide-smile',
    label: { fr: 'Icône', en: 'Icon' },
    group: 'text',
    aliases: ['i'],
    snippet: { fr: ':i{name="${ri:home-line}"}', en: ':i{name="${ri:home-line}"}' },
    description: { fr: 'Icône dans une phrase', en: 'Icon in a sentence' },
    docs: '/reference/nuxt#iconinline',
  },
  {
    name: 'Columns',
    icon: 'i-lucide-columns-2',
    label: { fr: 'Colonnes', en: 'Columns' },
    group: 'text',
    aliases: ['TwoColumns', 'ThreeColumns'],
    snippet: { fr: ':::Columns\n::Column\n${Colonne 1}\n::\n::Column\n${Colonne 2}\n::\n:::', en: ':::Columns\n::Column\n${Column 1}\n::\n::Column\n${Column 2}\n::\n:::' },
    description: { fr: 'Blocs côte à côte', en: 'Blocks side by side' },
    docs: '/reference/nuxt#columns',
  },
  { name: 'Column', aliases: ['column'], docs: '/reference/nuxt#column' },
  {
    name: 'Highlight',
    icon: 'i-lucide-highlighter',
    label: { fr: 'Message clé', en: 'Key message' },
    group: 'text',
    snippet: { fr: '::Highlight\n${Message clé.}\n::', en: '::Highlight\n${Key message.}\n::' },
    description: { fr: 'Message clé en gras, dans la couleur d\'accent, avec un liseré à gauche', en: 'Key message in bold, in the accent color, with a bar on its left' },
    docs: '/reference/nuxt#highlight',
  },
  {
    name: NOTES_COMPONENT,
    icon: 'i-lucide-notebook-pen',
    label: { fr: 'Notes de l\'orateur', en: 'Speaker notes' },
    group: 'slide',
    aliases: ['notes'],
    snippet: { fr: '::Notes\n${Ce que dit l\'orateur.}\n::', en: '::Notes\n${What the speaker says.}\n::' },
    description: { fr: 'Notes de l\'orateur, visibles dans la vue conférencier (touche S)', en: 'Speaker notes, shown in the speaker view (S key)' },
    docs: '/reference/nuxt#notes',
  },
  {
    name: 'Fragments',
    icon: 'i-lucide-list-start',
    label: { fr: 'Points un par un', en: 'Points one by one' },
    group: 'text',
    aliases: ['fragments'],
    snippet: { fr: '::Fragments\n- ${Premier point}\n- ${Deuxième point}\n::', en: '::Fragments\n- ${First point}\n- ${Second point}\n::' },
    description: { fr: 'Liste dont les éléments apparaissent un par un', en: 'List whose items appear one at a time' },
    docs: '/reference/nuxt#fragments',
  },
], BUILT_IN_ATTRIBUTES)
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
