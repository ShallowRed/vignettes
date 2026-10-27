/* eslint-disable no-template-curly-in-string -- `${…}` is the CodeMirror snippet placeholder syntax, not an unbuilt template literal */
import type { DeckComponent, DeckComponentGroup, LocalizedText } from '@vignettes/core/deck'
import { PUBLICATION_STATUSES } from '#shared/access'
import { attributedDirective, DECK_ANNOTATIONS, DECK_COMPONENT_GROUPS, deckComponentNamed, deckComponents, LAYOUT_ATTRIBUTES } from '@vignettes/core/deck'
import { CODE_THEMES } from '@vignettes/core/render'
import { knownThemes } from '@vignettes/core/theme'

/**
 * Declarative authoring reference for the writer: one dataset feeding the
 * autocompletion, the toolbar "Insérer" menu and the help panel. The components
 * and the annotations come from `@vignettes/core/deck`, with the snippet and the
 * description each declaration carries. The other labels and descriptions are
 * message keys of the `reference` locale file, and follow the engine contracts
 * (packages/core/src/deck/schema.ts): extend those first, then here.
 *
 * Snippet placeholders use the CodeMirror snippet syntax: `${label}`.
 */

export interface Translate {
  (key: string): string
  (key: string, plural: number): string
  (key: string, named: Record<string, unknown>): string
}

/** A component or an annotation, with its texts in the interface language. */
export interface DirectiveEntry {
  /** The deck syntax that opens it: `::Quote`, `:::Columns`, `:pretitle`. */
  syntax: string
  /** Its name in the interface. */
  label: string
  description: string
  group?: DeckComponentGroup
  /** Its icon, or the icon of its group. */
  icon: string
  /** Its section on the documentation site, read by `docsAddress`. */
  docs?: string
  /** The names of its attributes. */
  attributes?: readonly string[]
}

/** The icon of an entry that declares none. */
const GROUP_ICONS: Record<DeckComponentGroup | 'other', string> = {
  text: 'i-lucide-type',
  media: 'i-lucide-image',
  diagram: 'i-lucide-network',
  storybook: 'i-lucide-app-window',
  slide: 'i-lucide-presentation',
  other: 'i-lucide-shapes',
}

/** An insertable component or annotation. */
export interface ReferenceEntry extends DirectiveEntry {
  snippet: string
}

/** The frame of the sketch of a slide, in the 16:9 ratio of the slides. */
export const SKETCH_FRAME = { width: 96, height: 54 } as const

/** A rectangle of the sketch of a slide, in `SKETCH_FRAME`. */
export interface SketchShape {
  x: number
  y: number
  width: number
  height: number
  /** A title or a text line, a media, a background over the whole slide, or a card of the slide's color. */
  kind: 'title' | 'text' | 'media' | 'band' | 'card'
}

export interface SlideTemplate {
  labelKey: string
  descriptionKey: string
  /** The shapes of its sketch in the slide menu. */
  sketch: readonly SketchShape[]
  snippet: LocalizedText
  /** A section slide, whose `##` heading stays in both parsers. */
  section?: boolean
}

export interface FrontmatterKey {
  key: string
  descriptionKey: string
  /** Closed set of completable values, when the key has one. */
  values?: readonly string[]
  /** The value that applies when the key is absent. */
  default?: string
  /** Message key of the default, when words describe it instead of a value. */
  defaultKey?: string
  /** A text per interface language when the snippet has words to translate. */
  snippet: string | LocalizedText
  /** Keys nested under this one. */
  children?: readonly FrontmatterKey[]
}

const BOOLEAN = ['true', 'false'] as const

/** Reveal.js options a deck commonly sets, nested under `reveal:`. */
const REVEAL_KEYS: readonly FrontmatterKey[] = [
  { key: 'width', descriptionKey: 'reference.frontmatter.reveal.width', default: '960', snippet: 'width: 1280' },
  { key: 'height', descriptionKey: 'reference.frontmatter.reveal.height', default: '700', snippet: 'height: 720' },
  { key: 'margin', descriptionKey: 'reference.frontmatter.reveal.margin', default: '0.1', snippet: 'margin: ${0.04}' },
  { key: 'slideNumber', descriptionKey: 'reference.frontmatter.reveal.slideNumber', values: ['"c/t"', '"h.v"', '"c"', 'true', 'false'], default: '"c/t"', snippet: 'slideNumber: ${false}' },
  { key: 'transition', descriptionKey: 'reference.frontmatter.reveal.transition', values: ['slide', 'fade', 'none', 'convex', 'concave', 'zoom'], default: 'slide', snippet: 'transition: ${fade}' },
  { key: 'controls', descriptionKey: 'reference.frontmatter.reveal.controls', values: BOOLEAN, default: 'true', snippet: 'controls: ${false}' },
  { key: 'progress', descriptionKey: 'reference.frontmatter.reveal.progress', values: BOOLEAN, default: 'true', snippet: 'progress: ${false}' },
  { key: 'fragments', descriptionKey: 'reference.frontmatter.reveal.fragments', values: BOOLEAN, default: 'true', snippet: 'fragments: ${false}' },
  { key: 'fragmentInURL', descriptionKey: 'reference.frontmatter.reveal.fragmentInURL', values: BOOLEAN, default: 'false', snippet: 'fragmentInURL: ${true}' },
  { key: 'loop', descriptionKey: 'reference.frontmatter.reveal.loop', values: BOOLEAN, default: 'false', snippet: 'loop: ${true}' },
  { key: 'navigationMode', descriptionKey: 'reference.frontmatter.reveal.navigationMode', values: ['default', 'linear', 'grid'], default: 'default', snippet: 'navigationMode: ${linear}' },
  { key: 'autoSlide', descriptionKey: 'reference.frontmatter.reveal.autoSlide', default: '0', snippet: 'autoSlide: 5000' },
  { key: 'showNotes', descriptionKey: 'reference.frontmatter.reveal.showNotes', values: BOOLEAN, default: 'false', snippet: 'showNotes: ${true}' },
  { key: 'pdfMaxPagesPerSlide', descriptionKey: 'reference.frontmatter.reveal.pdfMaxPagesPerSlide', snippet: 'pdfMaxPagesPerSlide: 1' },
  { key: 'pdfSeparateFragments', descriptionKey: 'reference.frontmatter.reveal.pdfSeparateFragments', values: BOOLEAN, default: 'true', snippet: 'pdfSeparateFragments: ${false}' },
]

/** Background images per slide role, nested under `backgrounds:`. */
const BACKGROUND_KEYS: readonly FrontmatterKey[] = [
  { key: 'h1', descriptionKey: 'reference.frontmatter.backgrounds.h1', snippet: 'h1: ${/backgrounds/title.svg}' },
  { key: 'h2', descriptionKey: 'reference.frontmatter.backgrounds.h2', snippet: 'h2: ${/backgrounds/section.svg}' },
  { key: 'h3', descriptionKey: 'reference.frontmatter.backgrounds.h3', snippet: 'h3: ${/backgrounds/subsection.svg}' },
  { key: 'default', descriptionKey: 'reference.frontmatter.backgrounds.default', snippet: 'default: ${/backgrounds/default.svg}' },
]

/** Code theme properties, nested under `code:`; a name alone also works (`code: sombre`). */
const CODE_KEYS: readonly FrontmatterKey[] = [
  { key: 'theme', descriptionKey: 'reference.frontmatter.code.theme', values: Object.keys(CODE_THEMES), snippet: 'theme: ${sombre}' },
  { key: 'background', descriptionKey: 'reference.frontmatter.code.background', snippet: 'background: "${#161616}"' },
  { key: 'border', descriptionKey: 'reference.frontmatter.code.border', snippet: 'border: "${1px solid #DDDDDD}"' },
  { key: 'text', descriptionKey: 'reference.frontmatter.code.text', snippet: 'text: "${#F5F5FE}"' },
  { key: 'key', descriptionKey: 'reference.frontmatter.code.key', snippet: 'key: "${#F5F5FE}"' },
  { key: 'string', descriptionKey: 'reference.frontmatter.code.string', snippet: 'string: "${#FFCA00}"' },
  { key: 'literal', descriptionKey: 'reference.frontmatter.code.literal', snippet: 'literal: "${#6FE49D}"' },
  { key: 'keyword', descriptionKey: 'reference.frontmatter.code.keyword', snippet: 'keyword: "${#FF8D7E}"' },
  { key: 'function', descriptionKey: 'reference.frontmatter.code.function', snippet: 'function: "${#A1A1F8}"' },
  { key: 'comment', descriptionKey: 'reference.frontmatter.code.comment', snippet: 'comment: "${#A6A6A6}"' },
  { key: 'punctuation', descriptionKey: 'reference.frontmatter.code.punctuation', snippet: 'punctuation: "${#C1C1C1}"' },
  { key: 'keyWeight', descriptionKey: 'reference.frontmatter.code.keyWeight', values: ['400', '500', '600', '700'], snippet: 'keyWeight: 700' },
  { key: 'size', descriptionKey: 'reference.frontmatter.code.size', snippet: 'size: 13' },
  { key: 'dim', descriptionKey: 'reference.frontmatter.code.dim', default: '0.4', snippet: 'dim: ${0.72}' },
  { key: 'activeBackground', descriptionKey: 'reference.frontmatter.code.activeBackground', snippet: 'activeBackground: "${#E3E3FD}"' },
  { key: 'activeBar', descriptionKey: 'reference.frontmatter.code.activeBar', snippet: 'activeBar: "${#000091}"' },
]

export const FRONTMATTER_KEYS: readonly FrontmatterKey[] = [
  { key: 'title', descriptionKey: 'reference.frontmatter.root.title', defaultKey: 'reference.frontmatter.root.titleDefault', snippet: { fr: 'title: "${Titre}"', en: 'title: "${Title}"' } },
  { key: 'theme', descriptionKey: 'reference.frontmatter.root.theme', values: knownThemes(), snippet: 'theme: ${dsfr}' },
  { key: 'parser', descriptionKey: 'reference.frontmatter.root.parser', values: ['separator', 'heading'], default: 'separator', snippet: 'parser: ${separator}' },
  { key: 'lang', descriptionKey: 'reference.frontmatter.root.lang', values: ['fr', 'en'], default: 'fr', snippet: 'lang: ${fr}' },
  { key: 'project', descriptionKey: 'reference.frontmatter.root.project', snippet: { fr: 'project: ${slug-du-dossier}', en: 'project: ${folder-slug}' } },
  { key: 'status', descriptionKey: 'reference.frontmatter.root.status', values: PUBLICATION_STATUSES, default: 'private', snippet: 'status: ${private}' },
  { key: 'unlisted', descriptionKey: 'reference.frontmatter.root.unlisted', values: BOOLEAN, default: 'false', snippet: 'unlisted: ${true}' },
  { key: 'storybook', descriptionKey: 'reference.frontmatter.root.storybook', snippet: 'storybook: ${https://storybook.example.com}' },
  { key: 'backgrounds', descriptionKey: 'reference.frontmatter.root.backgrounds', snippet: 'backgrounds:\n  default: ${/backgrounds/default.svg}', children: BACKGROUND_KEYS },
  { key: 'code', descriptionKey: 'reference.frontmatter.root.code', values: Object.keys(CODE_THEMES), snippet: 'code: ${sombre}', children: CODE_KEYS },
  { key: 'reveal', descriptionKey: 'reference.frontmatter.root.reveal', snippet: 'reveal:\n  width: 1280\n  height: 720', children: REVEAL_KEYS },
  { key: 'accessPassword', descriptionKey: 'reference.frontmatter.root.accessPassword', snippet: { fr: 'accessPassword: ${motdepasse}', en: 'accessPassword: ${password}' } },
]

/** Keys a deck may still carry from older formats; known, never suggested. */
export const LEGACY_FRONTMATTER_KEYS: readonly string[] = ['access', 'transition', 'center']

/**
 * The text in the interface language, French when it has none in that
 * language. A plain string, the same in every language, comes back as it is.
 */
export function inLanguage(text: string | LocalizedText | undefined, lang: string): string {
  if (typeof text === 'string')
    return text
  return text?.[lang] ?? text?.fr ?? ''
}

/** The deck syntax that opens a snippet: `::Quote`, `:::Columns`, `:i`. */
function directiveOf(snippet: string): string {
  return /^:+[\w-]+/.exec(snippet)?.[0] ?? snippet
}

/** A component with its texts in the interface language, written with `syntax`; its name stands for a missing label. */
function componentEntry(component: DeckComponent, syntax: string, lang: string): DirectiveEntry {
  return {
    syntax,
    label: inLanguage(component.label, lang) || component.name,
    description: inLanguage(component.description, lang),
    group: component.group,
    icon: component.icon ?? GROUP_ICONS[component.group ?? 'other'],
    docs: component.docs,
    attributes: component.attributes?.map(attribute => attribute.name),
  }
}

/** An attribute of a component, with its description in the interface language. */
export interface ComponentAttributeEntry {
  name: string
  values?: readonly string[]
  boolean?: boolean
  default?: string
  description: string
}

/** The attributes of the component or the annotation a deck names `tag`, none when it declares none. */
export function componentAttributeEntries(tag: string, lang: string): ComponentAttributeEntry[] | undefined {
  return attributedDirective(tag)?.attributes?.map(attribute => ({ ...attribute, description: inLanguage(attribute.description, lang) }))
}

/**
 * The components a deck can use, read from the registry the renderer reads, so
 * a component an extension package or the application registers is offered
 * with its own snippet and description.
 */
export function componentEntries(lang: string): ReferenceEntry[] {
  return deckComponents()
    .filter((component): component is DeckComponent & { snippet: LocalizedText } => Boolean(component.snippet))
    .map((component) => {
      const snippet = inLanguage(component.snippet, lang)
      return { ...componentEntry(component, directiveOf(snippet), lang), snippet }
    })
}

/** The `:tag{…}` annotations the parser lifts out of the slide body. */
export function annotationEntries(lang: string): ReferenceEntry[] {
  return DECK_ANNOTATIONS.map(annotation => ({
    syntax: `:${annotation.tag}`,
    label: inLanguage(annotation.label, lang),
    description: inLanguage(annotation.description, lang),
    group: 'slide',
    icon: annotation.icon ?? GROUP_ICONS.slide,
    docs: annotation.docs,
    snippet: inLanguage(annotation.snippet, lang),
  }))
}

/** The groups of an editor's menus, the components outside every group last. */
export function groupedEntries(lang: string): { group: DeckComponentGroup | 'other', entries: ReferenceEntry[] }[] {
  const entries = [...componentEntries(lang), ...annotationEntries(lang)]
  return [...DECK_COMPONENT_GROUPS, 'other' as const]
    .map(group => ({ group, entries: entries.filter(entry => (entry.group ?? 'other') === group) }))
    .filter(({ entries }) => entries.length)
}

/**
 * The component or the annotation a directive opens, aliases included: a
 * component written inside another (`::Column`) comes with its name and its
 * documentation.
 */
export function directiveEntry(colons: string, name: string, lang: string): DirectiveEntry | undefined {
  if (colons === ':' && DECK_ANNOTATIONS.some(annotation => annotation.tag === name))
    return annotationEntries(lang).find(entry => entry.syntax === `:${name}`)
  const component = deckComponentNamed(name)
  return component && componentEntry(component, `${colons}${name}`, lang)
}

/** Sections of the documentation site the editor points to, read by `docsAddress`. */
export const DOCS_SECTIONS = {
  home: '/',
  frontmatter: '/ecrire/syntaxe#len-tête',
  layout: '/ecrire/syntaxe#les-mises-en-page',
  components: '/ecrire/composants',
  unknownComponent: '/studio/problemes-frequents#un-composant-est-souligné-en-orange',
  refusedAttribute: '/studio/problemes-frequents#adresse-refusée-ou-attribut-refusé',
} as const

/**
 * The address of a documentation section: a path of the documentation site
 * under `helpUrl`, the help address of the instance, or a full address. An
 * instance without a help address shows no link to a path.
 */
export function docsAddress(docs: string | undefined, helpUrl: string): string | undefined {
  if (!docs)
    return undefined
  if (/^https?:\/\//.test(docs))
    return docs
  if (!helpUrl)
    return undefined
  return new URL(docs.replace(/^\//, ''), helpUrl.endsWith('/') ? helpUrl : `${helpUrl}/`).href
}

export const title = (x: number, y: number, width: number, height = 5): SketchShape => ({ x, y, width, height, kind: 'title' })
export const text = (x: number, y: number, width: number): SketchShape => ({ x, y, width, height: 2.5, kind: 'text' })
const media = (x: number, y: number, width: number, height: number): SketchShape => ({ x, y, width, height, kind: 'media' })
const band: SketchShape = { x: 1, y: 1, width: 94, height: 52, kind: 'band' }
const column = (x: number, width: number, y = 20): SketchShape[] => [text(x, y, width), text(x, y + 6, width * 0.8), text(x, y + 12, width * 0.9)]

/**
 * Whole-slide starters with example texts, inserted from the slide menu of the
 * toolbar, drawn as their sketch. Each leads with `---` and a `##` heading, which
 * `slideTemplateFor` fits to the parser of the deck.
 */
export const SLIDE_TEMPLATES: readonly SlideTemplate[] = [
  {
    labelKey: 'reference.templates.twoColumns.label',
    descriptionKey: 'reference.templates.twoColumns.description',
    sketch: [title(10, 8, 40), ...column(10, 32), ...column(54, 32)],
    snippet: {
      fr: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::Column\n#### ${Ce qui change}\n${Les démarches se font en ligne, sans pièce justificative.}\n::\n::Column\n#### ${Ce qui reste}\n${Le guichet reçoit toujours sur rendez-vous.}\n::\n:::',
      en: '---\n\n## ${Slide title}\n\n:::Columns\n::Column\n#### ${What changes}\n${The procedures move online, with no supporting document.}\n::\n::Column\n#### ${What stays}\n${The front desk still sees people by appointment.}\n::\n:::',
    },
  },
  {
    labelKey: 'reference.templates.threeColumns.label',
    descriptionKey: 'reference.templates.threeColumns.description',
    sketch: [title(10, 8, 40), ...column(10, 22), ...column(37, 22), ...column(64, 22)],
    snippet: {
      fr: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::Column\n#### ${Découvrir}\n${Un premier rendez-vous pour comprendre le besoin.}\n::\n::Column\n#### ${Concevoir}\n${Des maquettes testées avec les usagers.}\n::\n::Column\n#### ${Livrer}\n${Une mise en ligne par étapes.}\n::\n:::',
      en: '---\n\n## ${Slide title}\n\n:::Columns\n::Column\n#### ${Discover}\n${A first meeting to understand the need.}\n::\n::Column\n#### ${Design}\n${Mockups tested with users.}\n::\n::Column\n#### ${Deliver}\n${A release in stages.}\n::\n:::',
    },
  },
  {
    labelKey: 'reference.templates.cover.label',
    descriptionKey: 'reference.templates.cover.description',
    sketch: [title(18, 20, 60, 7), text(30, 32, 36)],
    snippet: {
      fr: '---\n\n# ${Titre de la présentation}\n\n:subtitle{text="${Sous-titre ou accroche}"}',
      en: '---\n\n# ${Presentation title}\n\n:subtitle{text="${Subtitle or tagline}"}',
    },
  },
  {
    labelKey: 'reference.templates.section.label',
    section: true,
    descriptionKey: 'reference.templates.section.description',
    sketch: [band, text(12, 18, 22), title(12, 25, 50, 7)],
    snippet: {
      fr: '---\n\n## ${Titre de la section}\n\n:pretitle{text="${Partie 1}"}',
      en: '---\n\n## ${Section title}\n\n:pretitle{text="${Part 1}"}',
    },
  },
  {
    labelKey: 'reference.templates.keyPoints.label',
    descriptionKey: 'reference.templates.keyPoints.description',
    sketch: [title(10, 8, 40), text(12, 20, 50), text(12, 26, 44), text(12, 32, 48)],
    snippet: {
      fr: '---\n\n## ${Titre de la diapo}\n\n- ${Premier point clé}\n- ${Deuxième point clé}\n- ${Troisième point clé}',
      en: '---\n\n## ${Slide title}\n\n- ${First key point}\n- ${Second key point}\n- ${Third key point}',
    },
  },
  {
    labelKey: 'reference.templates.comparison.label',
    descriptionKey: 'reference.templates.comparison.description',
    sketch: [title(10, 8, 44), title(10, 19, 16, 3), ...column(10, 32, 26), title(54, 19, 16, 3), ...column(54, 32, 26)],
    snippet: {
      fr: '---\n\n## ${Titre de la comparaison}\n\n:::Columns\n::Column\n#### ${Avant}\n- ${Point un}\n- ${Point deux}\n::\n::Column\n#### ${Après}\n- ${Point un}\n- ${Point deux}\n::\n:::',
      en: '---\n\n## ${Comparison title}\n\n:::Columns\n::Column\n#### ${Before}\n- ${Point one}\n- ${Point two}\n::\n::Column\n#### ${After}\n- ${Point one}\n- ${Point two}\n::\n:::',
    },
  },
  {
    labelKey: 'reference.templates.mediaText.label',
    descriptionKey: 'reference.templates.mediaText.description',
    sketch: [title(8, 10, 34), text(8, 22, 34), text(8, 28, 28), media(48, 1, 47, 52)],
    snippet: {
      fr: '---\n\n## ${Titre de la diapo}\n\n:layout{media="${right}" size="${1/2}" src="${/images/placeholder.svg}" alt="${Description de l\'image}"}\n\n${Le parcours d\'inscription passe de six à trois écrans.}',
      en: '---\n\n## ${Slide title}\n\n:layout{media="${right}" size="${1/2}" src="${/images/placeholder.svg}" alt="${Image description}"}\n\n${The sign-up journey goes from six screens to three.}',
    },
  },
  {
    labelKey: 'reference.templates.quote.label',
    descriptionKey: 'reference.templates.quote.description',
    sketch: [title(14, 18, 2.5, 12), text(20, 19, 56), text(20, 25, 50), text(20, 34, 20)],
    snippet: {
      fr: '---\n\n::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation qui marque les esprits.}\n::',
      en: '---\n\n::Quote{author="${Author}" role="${Role}"}\n${The quote people remember.}\n::',
    },
  },
  {
    labelKey: 'reference.templates.fullScreenImage.label',
    descriptionKey: 'reference.templates.fullScreenImage.description',
    sketch: [media(1, 1, 94, 52), title(10, 38, 44)],
    snippet: {
      fr: '---\n\n## ${Titre de la diapo}\n\n:layout{media="behind" src="${/images/placeholder.svg}" alt="${Description}" veil="${50%}"}',
      en: '---\n\n## ${Slide title}\n\n:layout{media="behind" src="${/images/placeholder.svg}" alt="${Description}" veil="${50%}"}',
    },
  },
  {
    labelKey: 'reference.templates.storybookGallery.label',
    descriptionKey: 'reference.templates.storybookGallery.description',
    sketch: [title(10, 8, 40), media(10, 19, 36, 26), media(50, 19, 36, 26)],
    snippet: {
      fr: '---\n\n## ${Titre de la démo}\n\n:::Screens{cols="2"}\n::StoryFrame{story="${id-de-la-story}" label="${Écran 1}" lightbox}\n::\n::StoryFrame{story="${id-de-la-story}" label="${Écran 2}" lightbox}\n::\n:::',
      en: '---\n\n## ${Demo title}\n\n:::Screens{cols="2"}\n::StoryFrame{story="${story-id}" label="${Screen 1}" lightbox}\n::\n::StoryFrame{story="${story-id}" label="${Screen 2}" lightbox}\n::\n:::',
    },
  },
] as const

/** An attribute of `:layout`, with its description in the interface language. */
export interface LayoutAttributeEntry {
  name: string
  values?: readonly string[]
  default?: string
  flag?: boolean
  description: string
}

export function layoutAttributeEntries(lang: string): LayoutAttributeEntry[] {
  return LAYOUT_ATTRIBUTES.map(attribute => ({ ...attribute, description: inLanguage(attribute.description, lang) }))
}

export interface ShortcutEntry {
  keys: string[]
  descriptionKey: string
  /** What the shortcut does in the shared editor, when it differs from solo mode. */
  sharedDescriptionKey?: string
}

export const EDITOR_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ['meta', 'S'], descriptionKey: 'reference.shortcuts.saveDraft', sharedDescriptionKey: 'reference.shortcuts.captureSnapshot' },
  { keys: ['meta', 'B'], descriptionKey: 'reference.shortcuts.bold' },
  { keys: ['meta', 'I'], descriptionKey: 'reference.shortcuts.italic' },
  { keys: ['meta', 'Z'], descriptionKey: 'reference.shortcuts.undo' },
  { keys: ['meta', 'shift', 'space'], descriptionKey: 'reference.shortcuts.openCompletion' },
  { keys: ['tab'], descriptionKey: 'reference.shortcuts.indent' },
  { keys: ['alt', 'arrowup'], descriptionKey: 'reference.shortcuts.moveLine' },
  { keys: ['meta', 'shift', 'K'], descriptionKey: 'reference.shortcuts.deleteLine' },
  { keys: ['meta', '/'], descriptionKey: 'reference.shortcuts.comment' },
  { keys: ['meta', 'D'], descriptionKey: 'reference.shortcuts.selectNextOccurrence' },
  { keys: ['meta', 'shift', 'L'], descriptionKey: 'reference.shortcuts.selectAllOccurrences' },
  { keys: ['meta', 'alt', 'arrowdown'], descriptionKey: 'reference.shortcuts.addCursor' },
  { keys: ['meta', 'F'], descriptionKey: 'reference.shortcuts.findReplace' },
  { keys: ['meta', 'enter'], descriptionKey: 'reference.shortcuts.blankLineBelow' },
  { keys: ['alt', 'Z'], descriptionKey: 'reference.shortcuts.lineWrap' },
  { keys: ['meta', 'alt', 'L'], descriptionKey: 'reference.shortcuts.formatJson' },
] as const

/** Slide structure rules, per parser, as message keys. */
export const STRUCTURE_HELP = {
  heading: [
    'reference.structure.headingTitle',
    'reference.structure.headingHorizontal',
    'reference.structure.headingVertical',
    'reference.structure.headingBreak',
  ],
  separator: [
    'reference.structure.separatorHorizontal',
    'reference.structure.separatorVertical',
  ],
} as const
