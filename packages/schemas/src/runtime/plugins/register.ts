import { defineNuxtPlugin } from '#imports'
import { registerDeckComponents } from '@vignettes/core/deck'

// Declared before a deck is parsed or rendered, so `::Scheme` and the others
// resolve and the parser knows their shape.
export default defineNuxtPlugin(() => {
  registerDeckComponents([
    { name: 'Scheme', aliases: ['scheme'] },
    { name: 'Step', aliases: ['step'] },
    { name: 'Diagram', aliases: ['diagram'] },
    { name: 'Node', component: 'DiagramNode', aliases: ['node'] },
    { name: 'Edge', component: 'DiagramEdge', aliases: ['edge'] },
    { name: 'Area', component: 'DiagramArea', aliases: ['area'] },
    { name: 'JsonTour', aliases: ['json-tour'] },
    { name: 'Zone', component: 'JsonZone', aliases: ['zone'] },
  ])
})
