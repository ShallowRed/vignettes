import { defineNuxtPlugin } from '#imports'
import { registerDeckComponents } from '@vignettes/core/deck'

export default defineNuxtPlugin(() => {
  registerDeckComponents([
    { name: 'StoryFrame' },
    { name: 'Screens' },
  ])
})
