/* eslint-disable no-template-curly-in-string -- `${…}` is the CodeMirror snippet placeholder syntax, not an unbuilt template literal */
import { PUBLICATION_STATUSES } from '#shared/access'
import { knownThemes } from '@vignettes/core/theme'
import { SLIDE_LAYOUT_REGISTRY } from '@vignettes/nuxt/layouts'

/**
 * Declarative authoring reference for the writer: one dataset feeding the
 * autocompletion, the toolbar "Insérer" menu and the help panel. Descriptions
 * and snippets mirror the engine contracts (packages/core/src/deck/components.ts,
 * packages/core/src/deck/schema.ts, the layout registry of @vignettes/nuxt) — extend those first, then here.
 *
 * Snippet placeholders use the CodeMirror snippet syntax: `${label}`.
 */

export interface ReferenceSnippet {
  /** Completion/menu label (`::Quote`, `theme`). */
  label: string
  description: string
  /** CodeMirror snippet template (tabbable `${…}` placeholders). */
  snippet: string
}

export interface FrontmatterKey {
  key: string
  description: string
  /** Closed set of completable values, when the key has one. */
  values?: readonly string[]
  /** The value that applies when the key is absent. */
  default?: string
  snippet: string
  /** Keys nested under this one. */
  children?: readonly FrontmatterKey[]
}

const BOOLEAN = ['true', 'false'] as const

/** Reveal.js options a deck commonly sets, nested under `reveal:`. */
const REVEAL_KEYS: readonly FrontmatterKey[] = [
  { key: 'width', description: 'Largeur de référence d\'une diapo, en pixels', default: '960', snippet: 'width: ${1280}' },
  { key: 'height', description: 'Hauteur de référence d\'une diapo, en pixels', default: '700', snippet: 'height: ${720}' },
  { key: 'margin', description: 'Marge autour de la diapo, en fraction de sa taille', default: '0.1', snippet: 'margin: ${0.04}' },
  { key: 'slideNumber', description: 'Numéro de diapo : c/t (courante/total), h.v, c, ou false', values: ['"c/t"', '"h.v"', '"c"', 'true', 'false'], default: '"c/t"', snippet: 'slideNumber: ${false}' },
  { key: 'transition', description: 'Transition entre diapos', values: ['slide', 'fade', 'none', 'convex', 'concave', 'zoom'], default: 'slide', snippet: 'transition: ${fade}' },
  { key: 'center', description: 'Centre verticalement le contenu des diapos', values: BOOLEAN, default: 'false', snippet: 'center: ${true}' },
  { key: 'controls', description: 'Flèches de navigation à l\'écran', values: BOOLEAN, default: 'true', snippet: 'controls: ${false}' },
  { key: 'progress', description: 'Barre de progression en bas', values: BOOLEAN, default: 'true', snippet: 'progress: ${false}' },
  { key: 'fragments', description: 'Affiche les fragments un par un', values: BOOLEAN, default: 'true', snippet: 'fragments: ${false}' },
  { key: 'fragmentInURL', description: 'Inscrit le fragment courant dans l\'adresse', values: BOOLEAN, default: 'false', snippet: 'fragmentInURL: ${true}' },
  { key: 'loop', description: 'Revient à la première diapo après la dernière', values: BOOLEAN, default: 'false', snippet: 'loop: ${true}' },
  { key: 'navigationMode', description: 'Navigation au clavier : default, linear ou grid', values: ['default', 'linear', 'grid'], default: 'default', snippet: 'navigationMode: ${linear}' },
  { key: 'autoSlide', description: 'Avance automatique, en millisecondes (0 : désactivée)', default: '0', snippet: 'autoSlide: ${5000}' },
  { key: 'showNotes', description: 'Affiche les notes de l\'orateur à tous', values: BOOLEAN, default: 'false', snippet: 'showNotes: ${true}' },
  { key: 'pdfMaxPagesPerSlide', description: 'Pages maximum par diapo à l\'export PDF', snippet: 'pdfMaxPagesPerSlide: ${1}' },
  { key: 'pdfSeparateFragments', description: 'Une page par fragment à l\'export PDF', values: BOOLEAN, default: 'true', snippet: 'pdfSeparateFragments: ${false}' },
]

/** Background images per heading level, nested under `backgrounds:`. */
const BACKGROUND_KEYS: readonly FrontmatterKey[] = [
  { key: 'h1', description: 'Fond des diapos ouvertes par un titre #', snippet: 'h1: ${/backgrounds/title.svg}' },
  { key: 'h2', description: 'Fond des diapos ouvertes par un titre ##', snippet: 'h2: ${/backgrounds/section.svg}' },
  { key: 'h3', description: 'Fond des diapos ouvertes par un titre ###', snippet: 'h3: ${/backgrounds/subsection.svg}' },
  { key: 'default', description: 'Fond des autres diapos', snippet: 'default: ${/backgrounds/default.svg}' },
]

export const FRONTMATTER_KEYS: readonly FrontmatterKey[] = [
  { key: 'title', description: 'Titre de la présentation', default: 'l\'identifiant', snippet: 'title: "${Titre}"' },
  { key: 'theme', description: 'Thème visuel', values: knownThemes(), snippet: 'theme: ${dsfr}' },
  { key: 'parser', description: 'Découpage des diapos : separator (---) ou heading (titres)', values: ['separator', 'heading'], default: 'separator', snippet: 'parser: ${separator}' },
  { key: 'lang', description: 'Langue du document ; la typographie française s\'applique en fr', values: ['fr', 'en'], default: 'fr', snippet: 'lang: ${fr}' },
  { key: 'project', description: 'Dossier du catalogue (se règle aussi dans Partage et réglages)', snippet: 'project: ${slug-du-dossier}' },
  { key: 'status', description: 'Visibilité (Partage et réglages prend le dessus une fois la présentation publiée)', values: PUBLICATION_STATUSES, default: 'private', snippet: 'status: ${private}' },
  { key: 'unlisted', description: 'Accessible par lien mais absente du catalogue', values: BOOLEAN, default: 'false', snippet: 'unlisted: ${true}' },
  { key: 'storybook', description: 'Adresse du Storybook déployé, pour les ::StoryFrame', snippet: 'storybook: ${https://storybook.example.com}' },
  { key: 'backgrounds', description: 'Images de fond par niveau de titre', snippet: 'backgrounds:\n  default: ${/backgrounds/default.svg}', children: BACKGROUND_KEYS },
  { key: 'reveal', description: 'Options de Reveal.js : format, numérotation, transitions…', snippet: 'reveal:\n  width: ${1280}\n  height: ${720}', children: REVEAL_KEYS },
  { key: 'accessPassword', description: 'Mot de passe du statut semi-private (se règle plutôt dans Partage et réglages)', snippet: 'accessPassword: ${motdepasse}' },
]

/** Keys a deck may still carry from older formats; known, never suggested. */
export const LEGACY_FRONTMATTER_KEYS: readonly string[] = ['access', 'transition', 'center']

/** Components authored as `::Name … ::`, with real-world props as placeholders. */
export const COMPONENT_SNIPPETS: readonly ReferenceSnippet[] = [
  {
    label: '::Quote',
    description: 'Citation avec auteur, rôle et avatar optionnels',
    snippet: '::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation.}\n::',
  },
  {
    label: ':::Columns',
    description: 'Colonnes côte à côte (::column, span pour les largeurs)',
    snippet: ':::Columns\n::column\n${Colonne 1}\n::\n::column\n${Colonne 2}\n::\n:::',
  },
  {
    label: '::Highlight',
    description: 'Encadré de mise en avant (size sm/md, variant)',
    snippet: '::Highlight{size="${sm}"}\n${Message clé.}\n::',
  },
  {
    label: '::Mermaid',
    description: 'Diagramme Mermaid (flowchart, sequence…)',
    snippet: '::Mermaid\nflowchart LR\n    A[${Départ}] --> B[${Arrivée}]\n::',
  },
  {
    label: '::Image',
    description: 'Image avec cadrage (fit, position, rounded, shadow)',
    snippet: '::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: '::FullScreenImage',
    description: 'Image plein écran (occupe toute la diapo)',
    snippet: '::FullScreenImage{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: '::Iframe',
    description: 'Page web embarquée (lightbox, fullwidth)',
    snippet: '::Iframe{src="${https://exemple.fr}" title="${Titre}"}\n::',
  },
  {
    label: '::PreviewLink',
    description: 'Lien avec aperçu de la cible',
    snippet: '::PreviewLink{href="${https://exemple.fr}"}\n${Libellé du lien}\n::',
  },
  {
    label: ':::Screens',
    description: 'Galerie d\'écrans Storybook (cols, gap, align)',
    snippet: ':::Screens{cols="${2}"}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n:::',
  },
  {
    label: '::StoryFrame',
    description: 'Écran Storybook vivant (story, ratio, previewWidth, lightbox)',
    snippet: '::StoryFrame{story="${id-de-la-story}" ratio="${16/9}" previewWidth="${760}" label="${Libellé}" lightbox}\n::',
  },
  {
    label: ':i (icône)',
    description: 'Icône en ligne (Remix / Iconify)',
    snippet: ':i{name="${ri:home-line}"}',
  },
] as const

/** `:tag{…}` annotations the parser lifts out of the slide body. */
export const ANNOTATION_SNIPPETS: readonly ReferenceSnippet[] = [
  {
    label: ':layout',
    description: 'Mise en page de la diapo (media-right, grid-compact, full…)',
    snippet: ':layout{name="${media-right}"}',
  },
  {
    label: ':pretitle',
    description: 'Texte au-dessus du titre (fil rouge, contexte)',
    snippet: ':pretitle{text="${Contexte}"}',
  },
  {
    label: ':subtitle',
    description: 'Texte sous le titre (sous-titre de section)',
    snippet: ':subtitle{text="${Sous-titre}"}',
  },
  {
    label: ':slide-background',
    description: 'Image de fond propre à cette diapo',
    snippet: ':slide-background{image="${/backgrounds/exemple.svg}"}',
  },
  {
    label: ':quicklink',
    description: 'Lien de navigation épinglé en bas de diapo',
    snippet: ':quicklink{text="${Voir la démo}" href="${https://exemple.fr}"}',
  },
] as const

/**
 * Whole-slide starters with lorem placeholders, inserted from the toolbar
 * "Modèles" menu. Each leads with `---`, which opens a slide in both parsers.
 */
export const SLIDE_TEMPLATES: readonly ReferenceSnippet[] = [
  {
    label: 'Deux colonnes',
    description: 'Titre + deux colonnes avec sous-titres',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::column\n### ${Sous-titre 1}\n${Lorem ipsum dolor sit amet, consectetur adipiscing elit.}\n::\n::column\n### ${Sous-titre 2}\n${Sed do eiusmod tempor incididunt ut labore.}\n::\n:::',
  },
  {
    label: 'Trois colonnes',
    description: 'Titre + trois colonnes',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:::Columns\n::column\n### ${Colonne 1}\n${Lorem ipsum dolor sit amet.}\n::\n::column\n### ${Colonne 2}\n${Consectetur adipiscing elit.}\n::\n::column\n### ${Colonne 3}\n${Sed do eiusmod tempor.}\n::\n:::',
  },
  {
    label: 'Couverture',
    description: 'Diapo de garde : titre + sous-titre',
    snippet: '---\n\n## ${Titre de la présentation}\n\n:subtitle{text="${Sous-titre ou accroche}"}',
  },
  {
    label: 'Section',
    description: 'Intercalaire : surtitre + grand titre de partie',
    snippet: '---\n\n## ${Titre de la section}\n\n:pretitle{text="${Partie 1}"}',
  },
  {
    label: 'Points clés',
    description: 'Titre + liste à puces',
    snippet: '---\n\n## ${Titre de la diapo}\n\n- ${Premier point clé}\n- ${Deuxième point clé}\n- ${Troisième point clé}',
  },
  {
    label: 'Comparaison',
    description: 'Deux colonnes en vis-à-vis (avant/après, pour/contre)',
    snippet: '---\n\n## ${Titre de la comparaison}\n\n:::Columns\n::column\n### ${Avant}\n- ${Point un}\n- ${Point deux}\n::\n::column\n### ${Après}\n- ${Point un}\n- ${Point deux}\n::\n:::',
  },
  {
    label: 'Média + texte',
    description: 'Texte à gauche, image à droite (layout media-right)',
    snippet: '---\n\n## ${Titre de la diapo}\n\n:layout{name="media-right"}\n\n${Lorem ipsum dolor sit amet, consectetur adipiscing elit.}\n\n::Image{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: 'Citation',
    description: 'Citation pleine diapo (auteur, rôle)',
    snippet: '---\n\n::Quote{author="${Auteur}" role="${Rôle}"}\n${La citation qui marque les esprits.}\n::',
  },
  {
    label: 'Image plein écran',
    description: 'Image qui occupe toute la diapo',
    snippet: '---\n\n::FullScreenImage{src="${/images/placeholder.svg}" alt="${Description}"}\n::',
  },
  {
    label: 'Galerie Storybook',
    description: 'Titre + deux écrans Storybook côte à côte',
    snippet: '---\n\n## ${Titre de la démo}\n\n:::Screens{cols="${2}"}\n::StoryFrame{story="${id-de-la-story}" label="${Écran 1}" lightbox}\n::StoryFrame{story="${id-de-la-story}" label="${Écran 2}" lightbox}\n:::',
  },
] as const

export const LAYOUT_NAMES: readonly string[] = Object.keys(SLIDE_LAYOUT_REGISTRY)

export interface ShortcutEntry {
  keys: string[]
  description: string
}

export const EDITOR_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ['meta', 'S'], description: 'Enregistrer le brouillon' },
  { keys: ['meta', 'B'], description: 'Gras' },
  { keys: ['meta', 'I'], description: 'Italique' },
  { keys: ['meta', 'Z'], description: 'Annuler' },
  { keys: ['ctrl', 'space'], description: 'Ouvrir l\'autocomplétion' },
] as const

/** Slide structure rules, per parser. */
export const STRUCTURE_HELP = {
  heading: [
    '# Titre : première diapo (titre du deck)',
    '## Titre : nouvelle diapo horizontale',
    '### Titre : diapo verticale (empilée sous la précédente)',
    '--- : nouvelle diapo horizontale sans titre',
  ],
  separator: [
    '--- : nouvelle diapo horizontale',
    '---- : diapo verticale (empilée sous la précédente)',
  ],
} as const
