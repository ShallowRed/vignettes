import type { DeckMessages } from '@vignettes/core/render'
import type { ComputedRef, InjectionKey } from 'vue'

// The deck's frontmatter `storybook` root, read by the components that embed a story.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')

// Whether the surrounding deck renders as Reveal's print view, provided by `RevealPresentation`.
export const PRINT_VIEW_KEY: InjectionKey<boolean> = Symbol('printView')

// The chrome texts in the language of the deck, provided by `RevealPresentation`.
export const DECK_MESSAGES_KEY: InjectionKey<ComputedRef<DeckMessages>>
  = Symbol('deckMessages')
