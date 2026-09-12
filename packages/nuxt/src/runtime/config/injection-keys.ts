import type { ComputedRef, InjectionKey } from 'vue'

// The deck's frontmatter `storybook` root, read by the components that embed a story.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')
