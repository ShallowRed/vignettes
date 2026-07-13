import type { ComputedRef, InjectionKey } from 'vue'

// Carries the deck's frontmatter `storybook` root URL to <StoryFrame>/<Screens> so they resolve story ids.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')
