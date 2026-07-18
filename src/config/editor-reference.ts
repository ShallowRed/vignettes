/* eslint-disable no-template-curly-in-string -- `${…}` is the CodeMirror snippet placeholder syntax, not an unbuilt template literal */
import { PUBLICATION_STATUSES } from '#shared/access'
import { KNOWN_THEMES } from '#shared/theme'
import { SLIDE_LAYOUT_REGISTRY } from './layouts'

/**
 * Declarative authoring reference for the writer: one dataset feeding the
 * autocompletion, the toolbar "Insérer" menu and the help panel. Descriptions
 * and snippets mirror the engine contracts (shared/deck/components.ts,
 * shared/deck/schema.ts, config/layouts.ts) — extend those first, then here.
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
  snippet: string
}

export const FRONTMATTER_KEYS: readonly FrontmatterKey[] = [
  { key: 'title', description: 'Titre de la présentation', snippet: 'title: "${Titre}"' },
  { key: 'theme', description: 'Thème visuel du deck', values: KNOWN_THEMES, snippet: 'theme: ${dsfr}' },
  { key: 'project', description: 'Projet de rattachement au catalogue', snippet: 'project: ${slug-du-projet}' },
  { key: 'status', description: 'Statut de publication (la base prend le dessus pour les decks gérés)', values: PUBLICATION_STATUSES, snippet: 'status: ${draft}' },
  { key: 'parser', description: 'Découpage des diapos : heading (titres) ou separator (---)', values: ['heading', 'separator'], snippet: 'parser: ${heading}' },
  { key: 'lang', description: 'Langue du document (fr, en…)', snippet: 'lang: ${fr}' },
  { key: 'accessPassword', description: 'Mot de passe pour le statut semi-private', snippet: 'accessPassword: ${motdepasse}' },
  { key: 'storybook', description: 'Racine Storybook pour les StoryFrame (URL du storybook déployé)', snippet: 'storybook: ${https://storybook.example.com}' },
  { key: 'backgrounds', description: 'Images de fond par niveau de titre (h1/h2/h3/default)', snippet: 'backgrounds:\n  h1: ${/backgrounds/title.svg}\n  default: ${/backgrounds/default.svg}' },
  { key: 'reveal', description: 'Options Reveal.js (transition, slideNumber, controls…)', snippet: 'reveal:\n  transition: ${slide}\n  slideNumber: ${true}' },
] as const

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
    snippet: '::Image{src="${/images/exemple.png}" alt="${Description}"}\n::',
  },
  {
    label: '::FullScreenImage',
    description: 'Image plein écran (occupe toute la diapo)',
    snippet: '::FullScreenImage{src="${/images/exemple.png}" alt="${Description}"}\n::',
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
