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
    example: {
      content: [
        { name: 'Step', attributes: { n: '1', picto: '${buildings/city-hall}', title: { fr: '${Première étape}', en: '${First step}' } }, content: [{ fr: '${Légende}', en: '${Caption}' }] },
        { name: 'Step', attributes: { n: '2', picto: '${digital/coding}', title: { fr: '${Deuxième étape}', en: '${Second step}' } } },
      ],
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
    example: { attributes: { picto: '${digital/coding}', title: { fr: '${Étape}', en: '${Step}' } }, content: [{ fr: '${Légende}', en: '${Caption}' }] },
    description: { fr: 'Une étape illustrée', en: 'One illustrated step' },
    docs: '/reference/schemas#step',
  },
  {
    name: 'Diagram',
    icon: 'i-lucide-network',
    label: { fr: 'Schéma de cartes', en: 'Card diagram' },
    group: 'diagram',
    aliases: ['diagram'],
    example: {
      attributes: { layout: 'grid', cols: '2' },
      content: [
        { name: 'Node', attributes: { id: 'a', at: '1,1', title: '${Source}' } },
        { name: 'Node', attributes: { id: 'b', at: '2,1', title: '${Destination}' } },
        { name: 'Edge', attributes: { from: 'a', to: 'b', label: { fr: '${alimente}', en: '${feeds}' } } },
      ],
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
    example: { attributes: { id: '${id}', at: '${1,1}', title: { fr: '${Titre}', en: '${Title}' } } },
    description: { fr: 'Une carte du schéma, placée sur la grille', en: 'One card of the diagram, placed on the grid' },
    docs: '/reference/schemas#node',
  },
  {
    name: 'Edge',
    component: 'DiagramEdge',
    aliases: ['edge'],
    parent: 'Diagram',
    label: { fr: 'Flèche', en: 'Arrow' },
    example: { attributes: { from: '${a}', to: '${b}', label: { fr: '${libellé}', en: '${label}' } } },
    description: { fr: 'Une flèche entre deux cartes', en: 'An arrow between two cards' },
    docs: '/reference/schemas#edge',
  },
  {
    name: 'Area',
    component: 'DiagramArea',
    aliases: ['area'],
    parent: 'Diagram',
    label: { fr: 'Zone', en: 'Area' },
    example: { attributes: { at: '${1,1}', span: '${2,1}', title: { fr: '${Zone}', en: '${Area}' } } },
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
    example: {
      attributes: { file: { fr: '${exemple.json}', en: '${example.json}' } },
      content: [
        { name: 'Zone', attributes: { lines: '${2-3}', title: { fr: '${Identité}', en: '${Identity}' } }, content: [{ fr: '${Ce que ces lignes contiennent.}', en: '${What these lines hold.}' }] },
        { fr: '\n```json\n{\n  "name": "${exemple}",\n  "version": 1\n}\n```\n', en: '\n```json\n{\n  "name": "${example}",\n  "version": 1\n}\n```\n' },
      ],
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
    example: { attributes: { lines: '${1-4}', title: { fr: '${Titre}', en: '${Title}' } }, content: [{ fr: '${Ce que contiennent ces lignes}', en: '${What these lines hold}' }] },
    description: { fr: 'Des lignes du fichier, expliquées', en: 'Lines of the file, explained' },
    docs: '/reference/schemas#zone',
  },
], SCHEMA_ATTRIBUTES)
