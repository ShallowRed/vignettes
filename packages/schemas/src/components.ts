/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'
import { withAttributes } from '@vignettes/core/deck'
import { SCHEMA_ATTRIBUTES } from './component-attributes.ts'

/** The explanation kit's authoring components, as the deck dialect names them. */
export const SCHEMA_COMPONENTS: readonly DeckComponent[] = withAttributes([
  {
    name: 'Scheme',
    icon: 'i-lucide-route',
    label: { fr: 'Étapes illustrées', en: 'Illustrated steps' },
    group: 'diagram',
    aliases: ['scheme'],
    snippet: {
      fr: ':::Scheme\n::Step{n="1" picto="${buildings/city-hall}" title="${Première étape}"}\n${Légende}\n::\n::Step{n="2" picto="${digital/coding}" title="${Deuxième étape}"}\n::\n:::',
      en: ':::Scheme\n::Step{n="1" picto="${buildings/city-hall}" title="${First step}"}\n${Caption}\n::\n::Step{n="2" picto="${digital/coding}" title="${Second step}"}\n::\n:::',
    },
    description: {
      fr: 'Étapes illustrées reliées par des flèches, qui apparaissent une à une',
      en: 'Illustrated steps linked by arrows, which appear one at a time',
    },
    docs: '/reference/schemas#scheme',
  },
  {
    name: 'Step',
    aliases: ['step'],
    parent: 'Scheme',
    label: { fr: 'Étape', en: 'Step' },
    snippet: { fr: '::Step{picto="${digital/coding}" title="${Étape}"}\n${Légende}\n::', en: '::Step{picto="${digital/coding}" title="${Step}"}\n${Caption}\n::' },
    description: { fr: 'Une étape illustrée', en: 'One illustrated step' },
    docs: '/reference/schemas#step',
  },
  {
    name: 'Diagram',
    icon: 'i-lucide-network',
    label: { fr: 'Schéma de cartes', en: 'Card diagram' },
    group: 'diagram',
    aliases: ['diagram'],
    snippet: {
      fr: ':::Diagram{layout="grid" cols="2"}\n::Node{id="a" at="1,1" title="${Source}"}\n::\n::Node{id="b" at="2,1" title="${Destination}"}\n::\n::Edge{from="a" to="b" label="${alimente}"}\n::\n:::',
      en: ':::Diagram{layout="grid" cols="2"}\n::Node{id="a" at="1,1" title="${Source}"}\n::\n::Node{id="b" at="2,1" title="${Destination}"}\n::\n::Edge{from="a" to="b" label="${feeds}"}\n::\n:::',
    },
    description: {
      fr: 'Cartes reliées par des flèches, placées sur une grille',
      en: 'Cards linked by arrows, placed on a grid',
    },
    docs: '/reference/schemas#diagram',
  },
  {
    name: 'Node',
    component: 'DiagramNode',
    aliases: ['node'],
    parent: 'Diagram',
    label: { fr: 'Carte', en: 'Card' },
    snippet: { fr: '::Node{id="${id}" at="${1,1}" title="${Titre}"}\n::', en: '::Node{id="${id}" at="${1,1}" title="${Title}"}\n::' },
    description: { fr: 'Une carte du schéma, placée sur la grille', en: 'One card of the diagram, placed on the grid' },
    docs: '/reference/schemas#node',
  },
  {
    name: 'Edge',
    component: 'DiagramEdge',
    aliases: ['edge'],
    parent: 'Diagram',
    label: { fr: 'Flèche', en: 'Arrow' },
    snippet: { fr: '::Edge{from="${a}" to="${b}" label="${libellé}"}\n::', en: '::Edge{from="${a}" to="${b}" label="${label}"}\n::' },
    description: { fr: 'Une flèche entre deux cartes', en: 'An arrow between two cards' },
    docs: '/reference/schemas#edge',
  },
  {
    name: 'Area',
    component: 'DiagramArea',
    aliases: ['area'],
    parent: 'Diagram',
    label: { fr: 'Zone', en: 'Area' },
    snippet: { fr: '::Area{at="${1,1}" span="${2,1}" title="${Zone}"}\n::', en: '::Area{at="${1,1}" span="${2,1}" title="${Area}"}\n::' },
    description: { fr: 'Une zone qui regroupe des cartes', en: 'A region that groups cards' },
    docs: '/reference/schemas#area',
  },
  {
    name: 'JsonTour',
    icon: 'i-lucide-file-json',
    label: { fr: 'Fichier commenté', en: 'Annotated file' },
    group: 'diagram',
    aliases: ['json-tour'],
    images: ['image'],
    snippet: {
      fr: ':::JsonTour{file="${exemple.json}"}\n::Zone{lines="${2-3}" title="${Identité}"}\n${Ce que ces lignes contiennent.}\n::\n\n```json\n{\n  "name": "${exemple}",\n  "version": 1\n}\n```\n\n:::',
      en: ':::JsonTour{file="${example.json}"}\n::Zone{lines="${2-3}" title="${Identity}"}\n${What these lines hold.}\n::\n\n```json\n{\n  "name": "${example}",\n  "version": 1\n}\n```\n\n:::',
    },
    description: {
      fr: 'Fichier commenté zone par zone, à côté de ses explications',
      en: 'File explained zone by zone, beside its explanations',
    },
    docs: '/reference/schemas#jsontour',
  },
  {
    name: 'Zone',
    component: 'JsonZone',
    aliases: ['zone'],
    parent: 'JsonTour',
    label: { fr: 'Étape de la visite', en: 'Tour step' },
    snippet: { fr: '::Zone{lines="${1-4}" title="${Titre}"}\n${Ce que contiennent ces lignes}\n::', en: '::Zone{lines="${1-4}" title="${Title}"}\n${What these lines hold}\n::' },
    description: { fr: 'Des lignes du fichier, expliquées', en: 'Lines of the file, explained' },
    docs: '/reference/schemas#zone',
  },
], SCHEMA_ATTRIBUTES)
