import type { DeckComponent } from '@vignettes/core/deck'

/** The explanation kit's authoring components, as the deck dialect names them. */
export const SCHEMA_COMPONENTS: readonly DeckComponent[] = [
  { name: 'Scheme', aliases: ['scheme'] },
  { name: 'Step', aliases: ['step'] },
  { name: 'Diagram', aliases: ['diagram'] },
  { name: 'Node', component: 'DiagramNode', aliases: ['node'] },
  { name: 'Edge', component: 'DiagramEdge', aliases: ['edge'] },
  { name: 'Area', component: 'DiagramArea', aliases: ['area'] },
  { name: 'JsonTour', aliases: ['json-tour'] },
  { name: 'Zone', component: 'JsonZone', aliases: ['zone'] },
]
