import { registerDeckComponents } from '@vignettes/core/deck'

// `::RuleCard` describes an entry of the rules registry, which belongs to this
// instance rather than to the render layer.
export default defineNuxtPlugin(() => {
  registerDeckComponents([
    { name: 'RuleCard', aliases: ['rule-card'] },
  ])
})
