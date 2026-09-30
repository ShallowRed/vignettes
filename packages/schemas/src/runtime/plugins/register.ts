import { defineNuxtPlugin } from '#imports'
import { registerDeckComponents } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '../../components.ts'

// Declared before a deck is parsed or rendered, so `::Scheme` and the others
// resolve and the parser knows their shape.
export default defineNuxtPlugin(() => {
  registerDeckComponents(SCHEMA_COMPONENTS)
})
