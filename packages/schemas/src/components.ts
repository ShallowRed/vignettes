/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'

/** The explanation kit's authoring components, as the deck dialect names them. */
export const SCHEMA_COMPONENTS: readonly DeckComponent[] = [
  {
    name: 'Scheme',
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
  { name: 'Step', aliases: ['step'], docs: '/reference/schemas#step' },
  {
    name: 'Diagram',
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
  { name: 'Node', component: 'DiagramNode', aliases: ['node'], docs: '/reference/schemas#node' },
  { name: 'Edge', component: 'DiagramEdge', aliases: ['edge'], docs: '/reference/schemas#edge' },
  { name: 'Area', component: 'DiagramArea', aliases: ['area'], docs: '/reference/schemas#area' },
  {
    name: 'JsonTour',
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
  { name: 'Zone', component: 'JsonZone', aliases: ['zone'], docs: '/reference/schemas#zone' },
]
