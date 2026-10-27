/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'

/** The explanation kit's authoring components, as the deck dialect names them. */
export const SCHEMA_COMPONENTS: readonly DeckComponent[] = [
  {
    name: 'Scheme',
    aliases: ['scheme'],
    snippet: {
      fr: ':::Scheme\n::Step{n="1" picto="${buildings/city-hall}" title="${Première étape}"}\n${Légende}\n::\n::Step{n="2" picto="${digital/coding}" title="${Deuxième étape}"}\n::\n:::',
      en: ':::Scheme\n::Step{n="1" picto="${buildings/city-hall}" title="${First step}"}\n${Caption}\n::\n::Step{n="2" picto="${digital/coding}" title="${Second step}"}\n::\n:::',
    },
    description: {
      fr: 'Étapes illustrées reliées par des flèches, qui apparaissent une à une',
      en: 'Illustrated steps linked by arrows, which appear one at a time (::Step, attributes size, tiles, arrows)',
    },
  },
  { name: 'Step', aliases: ['step'] },
  {
    name: 'Diagram',
    aliases: ['diagram'],
    snippet: {
      fr: ':::Diagram{layout="grid" cols="2"}\n::Node{id="a" at="1,1" title="${Source}"}\n::\n::Node{id="b" at="2,1" title="${Destination}"}\n::\n::Edge{from="a" to="b" label="${alimente}"}\n::\n:::',
      en: ':::Diagram{layout="grid" cols="2"}\n::Node{id="a" at="1,1" title="${Source}"}\n::\n::Node{id="b" at="2,1" title="${Destination}"}\n::\n::Edge{from="a" to="b" label="${feeds}"}\n::\n:::',
    },
    description: {
      fr: 'Cartes reliées par des flèches, placées sur une grille',
      en: 'Cards placed on a grid or ranked automatically, linked by arrows (::Node, ::Edge, ::Area)',
    },
  },
  { name: 'Node', component: 'DiagramNode', aliases: ['node'] },
  { name: 'Edge', component: 'DiagramEdge', aliases: ['edge'] },
  { name: 'Area', component: 'DiagramArea', aliases: ['area'] },
  {
    name: 'JsonTour',
    aliases: ['json-tour'],
    images: ['image'],
    snippet: {
      fr: ':::JsonTour{file="${exemple.json}"}\n::Zone{lines="${2-3}" title="${Identité}"}\n${Ce que ces lignes contiennent.}\n::\n\n```json\n{\n  "name": "${exemple}",\n  "version": 1\n}\n```\n\n:::',
      en: ':::JsonTour{file="${example.json}"}\n::Zone{lines="${2-3}" title="${Identity}"}\n${What these lines hold.}\n::\n\n```json\n{\n  "name": "${example}",\n  "version": 1\n}\n```\n\n:::',
    },
    description: {
      fr: 'Fichier commenté zone par zone, à côté de ses explications',
      en: 'A file shown beside the description of its parts, zone by zone (::Zone, attributes file, height, panel)',
    },
  },
  { name: 'Zone', component: 'JsonZone', aliases: ['zone'] },
]
