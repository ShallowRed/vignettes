/* eslint-disable no-template-curly-in-string -- `${…}` is the CodeMirror snippet placeholder syntax, not an unbuilt template literal */
import { PUBLICATION_STATUSES } from '#shared/access'
import { CODE_THEMES } from '@vignettes/core/render'
import { knownThemes } from '@vignettes/core/theme'
import { SLIDE_LAYOUT_REGISTRY } from '@vignettes/nuxt/layouts'

/**
 * Declarative authoring reference for the writer: one dataset feeding the
 * autocompletion, the toolbar "Insérer" menu and the help panel. Labels and
 * descriptions are message keys of the `reference` locale file. Descriptions
 * and snippets mirror the engine contracts (packages/core/src/deck/components.ts,
 * packages/core/src/deck/schema.ts, the layout registry of @vignettes/nuxt) — extend those first, then here.
 *
 * Snippet placeholders use the CodeMirror snippet syntax: `${label}`.
 */

export interface Translate {
  (key: string): string
  (key: string, plural: number): string
  (key: string, named: Record<string, unknown>): string
}

export interface ReferenceSnippet {
  /** Deck syntax of the entry (`::Quote`, `:layout`), shown as its label. */
  label: string
  /** Message key of the label, for an entry whose label carries words. */
  labelKey?: string
  descriptionKey: string
  /** CodeMirror snippet template (tabbable `${…}` placeholders). */
  snippet: string
}

export interface SlideTemplate {
  labelKey: string
  descriptionKey: string
  snippet: string
}

/** The label an entry displays: its translated label, or its deck syntax. */
export function referenceLabel(entry: ReferenceSnippet, t: Translate): string {
  return entry.labelKey ? t(entry.labelKey) : entry.label
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
  snippet: string
  /** Keys nested under this one. */
  children?: readonly FrontmatterKey[]
}

const BOOLEAN = ['true', 'false'] as const

/** Reveal.js options a deck commonly sets, nested under `reveal:`. */
const REVEAL_KEYS: readonly FrontmatterKey[] = [
  { key: 'width', descriptionKey: 'reference.frontmatter.reveal.width', default: '960', snippet: 'width: ${1280}' },
  { key: 'height', descriptionKey: 'reference.frontmatter.reveal.height', default: '700', snippet: 'height: ${720}' },
  { key: 'margin', descriptionKey: 'reference.frontmatter.reveal.margin', default: '0.1', snippet: 'margin: ${0.04}' },
  { key: 'slideNumber', descriptionKey: 'reference.frontmatter.reveal.slideNumber', values: ['"c/t"', '"h.v"', '"c"', 'true', 'false'], default: '"c/t"', snippet: 'slideNumber: ${false}' },
  { key: 'transition', descriptionKey: 'reference.frontmatter.reveal.transition', values: ['slide', 'fade', 'none', 'convex', 'concave', 'zoom'], default: 'slide', snippet: 'transition: ${fade}' },
  { key: 'center', descriptionKey: 'reference.frontmatter.reveal.center', values: BOOLEAN, default: 'false', snippet: 'center: ${true}' },
  { key: 'controls', descriptionKey: 'reference.frontmatter.reveal.controls', values: BOOLEAN, default: 'true', snippet: 'controls: ${false}' },
  { key: 'progress', descriptionKey: 'reference.frontmatter.reveal.progress', values: BOOLEAN, default: 'true', snippet: 'progress: ${false}' },
  { key: 'fragments', descriptionKey: 'reference.frontmatter.reveal.fragments', values: BOOLEAN, default: 'true', snippet: 'fragments: ${false}' },
  { key: 'fragmentInURL', descriptionKey: 'reference.frontmatter.reveal.fragmentInURL', values: BOOLEAN, default: 'false', snippet: 'fragmentInURL: ${true}' },
  { key: 'loop', descriptionKey: 'reference.frontmatter.reveal.loop', values: BOOLEAN, default: 'false', snippet: 'loop: ${true}' },
  { key: 'navigationMode', descriptionKey: 'reference.frontmatter.reveal.navigationMode', values: ['default', 'linear', 'grid'], default: 'default', snippet: 'navigationMode: ${linear}' },
  { key: 'autoSlide', descriptionKey: 'reference.frontmatter.reveal.autoSlide', default: '0', snippet: 'autoSlide: ${5000}' },
  { key: 'showNotes', descriptionKey: 'reference.frontmatter.reveal.showNotes', values: BOOLEAN, default: 'false', snippet: 'showNotes: ${true}' },
  { key: 'pdfMaxPagesPerSlide', descriptionKey: 'reference.frontmatter.reveal.pdfMaxPagesPerSlide', snippet: 'pdfMaxPagesPerSlide: ${1}' },
  { key: 'pdfSeparateFragments', descriptionKey: 'reference.frontmatter.reveal.pdfSeparateFragments', values: BOOLEAN, default: 'true', snippet: 'pdfSeparateFragments: ${false}' },
]

/** Background images per heading level, nested under `backgrounds:`. */
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
  { key: 'keyWeight', descriptionKey: 'reference.frontmatter.code.keyWeight', values: ['400', '500', '600', '700'], snippet: 'keyWeight: ${700}' },
  { key: 'size', descriptionKey: 'reference.frontmatter.code.size', snippet: 'size: ${13}' },
  { key: 'dim', descriptionKey: 'reference.frontmatter.code.dim', default: '0.4', snippet: 'dim: ${0.72}' },
  { key: 'activeBackground', descriptionKey: 'reference.frontmatter.code.activeBackground', snippet: 'activeBackground: "${#E3E3FD}"' },
  { key: 'activeBar', descriptionKey: 'reference.frontmatter.code.activeBar', snippet: 'activeBar: "${#000091}"' },
]

export const FRONTMATTER_KEYS: readonly FrontmatterKey[] = [
  { key: 'title', descriptionKey: 'reference.frontmatter.root.title', defaultKey: 'reference.frontmatter.root.titleDefault', snippet: 'title: "${Titre}"' },
  { key: 'theme', descriptionKey: 'reference.frontmatter.root.theme', values: knownThemes(), snippet: 'theme: ${dsfr}' },
  { key: 'parser', descriptionKey: 'reference.frontmatter.root.parser', values: ['separator', 'heading'], default: 'separator', snippet: 'parser: ${separator}' },
  { key: 'lang', descriptionKey: 'reference.frontmatter.root.lang', values: ['fr', 'en'], default: 'fr', snippet: 'lang: ${fr}' },
  { key: 'project', descriptionKey: 'reference.frontmatter.root.project', snippet: 'project: ${slug-du-dossier}' },
  { key: 'status', descriptionKey: 'reference.frontmatter.root.status', values: PUBLICATION_STATUSES, default: 'private', snippet: 'status: ${private}' },
  { key: 'unlisted', descriptionKey: 'reference.frontmatter.root.unlisted', values: BOOLEAN, default: 'false', snippet: 'unlisted: ${true}' },
  { key: 'storybook', descriptionKey: 'reference.frontmatter.root.storybook', snippet: 'storybook: ${https://storybook.example.com}' },
  { key: 'backgrounds', descriptionKey: 'reference.frontmatter.root.backgrounds', snippet: 'backgrounds:\n  default: ${/backgrounds/default.svg}', children: BACKGROUND_KEYS },
  { key: 'code', descriptionKey: 'reference.frontmatter.root.code', values: Object.keys(CODE_THEMES), snippet: 'code: ${sombre}', children: CODE_KEYS },
  { key: 'reveal', descriptionKey: 'reference.frontmatter.root.reveal', snippet: 'reveal:\n  width: ${1280}\n  height: ${720}', children: REVEAL_KEYS },
  { key: 'accessPassword', descriptionKey: 'reference.frontmatter.root.accessPassword', snippet: 'accessPassword: ${motdepasse}' },
]

/** Keys a deck may still carry from older formats; known, never suggested. */
export const LEGACY_FRONTMATTER_KEYS: readonly string[] = ['access', 'transition', 'center']

/** Components authored as `::Name … ::`, with real-world props as placeholders. */
export const COMPONENT_SNIPPETS: readonly ReferenceSnippet[] = [
  {
    label: '::Quote',
    descriptionKey: 'reference.components.quote',
    snippet: '::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation.}\n::',
  },
  {
    label: ':::Columns',
    descriptionKey: 'reference.components.columns',
    snippet: ':::Columns\n::column\n${Colonne 1}\n::\n::column\n${Colonne 2}\n::\n:::',
  },
  {
    label: '::Highlight',
    descriptionKey: 'reference.components.highlight',
    snippet: '::Highlight{size="${sm}"}\n${Message clé.}\n::',
  },
  {
    label: '::Mermaid',
    descriptionKey: 'reference.components.mermaid',
    snippet: '::Mermaid\nflowchart LR\n    A[${Départ}] --> B[${Arrivée}]\n::',
  },
  {
    label: '::Image',
    descriptionKey: 'reference.components.image',
    snippet: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: '::FullScreenImage',
    descriptionKey: 'reference.components.fullScreenImage',
    snippet: '::FullScreenImage{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: '::Iframe',
    descriptionKey: 'reference.components.iframe',
    snippet: '::Iframe{src="${https://exemple.fr}" title="${Titre}"}\n::',
  },
  {
    label: ':::Screens',
    descriptionKey: 'reference.components.screens',
    snippet: ':::Screens{cols="${2}"}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n:::',
  },
  {
    label: '::StoryFrame',
    descriptionKey: 'reference.components.storyFrame',
    snippet: '::StoryFrame{story="${id-de-la-story}" ratio="${16/9}" previewWidth="${760}" label="${Libellé}" lightbox}\n::',
  },
  {
    label: ':i',
    labelKey: 'reference.components.iconLabel',
    descriptionKey: 'reference.components.icon',
    snippet: ':i{name="${ri:home-line}"}',
  },
] as const

/** `:tag{…}` annotations the parser lifts out of the slide body. */
export const ANNOTATION_SNIPPETS: readonly ReferenceSnippet[] = [
  {
    label: ':layout',
    descriptionKey: 'reference.annotations.layout',
    snippet: ':layout{name="${media-right}"}',
  },
  {
    label: ':pretitle',
    descriptionKey: 'reference.annotations.pretitle',
    snippet: ':pretitle{text="${Contexte}"}',
  },
  {
    label: ':subtitle',
    descriptionKey: 'reference.annotations.subtitle',
    snippet: ':subtitle{text="${Sous-titre}"}',
  },
  {
    label: ':slide-background',
    descriptionKey: 'reference.annotations.slideBackground',
    snippet: ':slide-background{image="${/backgrounds/exemple.svg}"}',
  },
  {
    label: ':quicklink',
    descriptionKey: 'reference.annotations.quicklink',
    snippet: ':quicklink{text="${Voir la démo}" href="${https://exemple.fr}"}',
  },
] as const

/**
 * Whole-slide starters with lorem placeholders, inserted from the toolbar
 * "Modèles" menu. Each leads with `---`, which opens a slide in both parsers.
 */
export const SLIDE_TEMPLATES: readonly SlideTemplate[] = [
  {
    labelKey: 'reference.templates.twoColumns.label',
    descriptionKey: 'reference.templates.twoColumns.description',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::column\n### ${Sous-titre 1}\n${Lorem ipsum dolor sit amet, consectetur adipiscing elit.}\n::\n::column\n### ${Sous-titre 2}\n${Sed do eiusmod tempor incididunt ut labore.}\n::\n:::',
  },
  {
    labelKey: 'reference.templates.threeColumns.label',
    descriptionKey: 'reference.templates.threeColumns.description',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::column\n### ${Colonne 1}\n${Lorem ipsum dolor sit amet.}\n::\n::column\n### ${Colonne 2}\n${Consectetur adipiscing elit.}\n::\n::column\n### ${Colonne 3}\n${Sed do eiusmod tempor.}\n::\n:::',
  },
  {
    labelKey: 'reference.templates.cover.label',
    descriptionKey: 'reference.templates.cover.description',
    snippet: '---\n\n## ${Titre de la présentation}\n\n:subtitle{text="${Sous-titre ou accroche}"}',
  },
  {
    labelKey: 'reference.templates.section.label',
    descriptionKey: 'reference.templates.section.description',
    snippet: '---\n\n## ${Titre de la section}\n\n:pretitle{text="${Partie 1}"}',
  },
  {
    labelKey: 'reference.templates.keyPoints.label',
    descriptionKey: 'reference.templates.keyPoints.description',
    snippet: '---\n\n## ${Titre de la diapo}\n\n- ${Premier point clé}\n- ${Deuxième point clé}\n- ${Troisième point clé}',
  },
  {
    labelKey: 'reference.templates.comparison.label',
    descriptionKey: 'reference.templates.comparison.description',
    snippet: '---\n\n## ${Titre de la comparaison}\n\n:::Columns\n::column\n### ${Avant}\n- ${Point un}\n- ${Point deux}\n::\n::column\n### ${Après}\n- ${Point un}\n- ${Point deux}\n::\n:::',
  },
  {
    labelKey: 'reference.templates.mediaText.label',
    descriptionKey: 'reference.templates.mediaText.description',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:layout{name="media-right"}\n\n${Lorem ipsum dolor sit amet, consectetur adipiscing elit.}\n\n::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    labelKey: 'reference.templates.quote.label',
    descriptionKey: 'reference.templates.quote.description',
    snippet: '---\n\n::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation qui marque les esprits.}\n::',
  },
  {
    labelKey: 'reference.templates.fullScreenImage.label',
    descriptionKey: 'reference.templates.fullScreenImage.description',
    snippet: '---\n\n::FullScreenImage{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    labelKey: 'reference.templates.storybookGallery.label',
    descriptionKey: 'reference.templates.storybookGallery.description',
    snippet: '---\n\n## ${Titre de la démo}\n\n:::Screens{cols="${2}"}\n::StoryFrame{story="${id-de-la-story}" label="${Écran 1}" lightbox}\n::StoryFrame{story="${id-de-la-story}" label="${Écran 2}" lightbox}\n:::',
  },
] as const

export const LAYOUT_NAMES: readonly string[] = Object.keys(SLIDE_LAYOUT_REGISTRY)

export interface ShortcutEntry {
  keys: string[]
  descriptionKey: string
}

export const EDITOR_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ['meta', 'S'], descriptionKey: 'reference.shortcuts.saveDraft' },
  { keys: ['meta', 'B'], descriptionKey: 'reference.shortcuts.bold' },
  { keys: ['meta', 'I'], descriptionKey: 'reference.shortcuts.italic' },
  { keys: ['meta', 'Z'], descriptionKey: 'reference.shortcuts.undo' },
  { keys: ['ctrl', 'space'], descriptionKey: 'reference.shortcuts.openCompletion' },
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
