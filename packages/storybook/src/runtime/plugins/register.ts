import { defineNuxtPlugin } from '#imports'
import { registerDeckComponents } from '@vignettes/core/deck'
import { STORYBOOK_COMPONENTS } from '../../components.ts'

export default defineNuxtPlugin(() => {
  registerDeckComponents(STORYBOOK_COMPONENTS)
})
