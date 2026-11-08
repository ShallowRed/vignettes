import type { Slide } from '@vignettes/core/deck'
import type { DeckMessages } from '@vignettes/core/render'
import type { ComputedRef, InjectionKey } from 'vue'

// Lets a component of a slide tell Reveal that it added or moved fragments, provided by `RevealPresentation`.
export const REVEAL_SYNC: InjectionKey<() => void> = Symbol('revealSync')

// The deck's frontmatter `storybook` root, read by the components that embed a story.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')

// The chrome texts in the language of the deck, provided by `RevealPresentation`.
export const DECK_MESSAGES_KEY: InjectionKey<ComputedRef<DeckMessages>>
  = Symbol('deckMessages')

/** A component of a slide that threw while it rendered, which the slide draws without it. */
export interface SlideRenderFailure {
  slide: Slide
  /** The names the deck writes the component under, `i` and `IconInline` for the icon. */
  names: string[]
  /** Its rank among the components of the slide written under these names, from zero. */
  index: number
}

/**
 * Receives the render failures of the slides of a deck, provided by a page
 * that lists them, as the editor does. `owner` stands for one mounted deck:
 * each call replaces its list, and an empty list clears it.
 */
export const SLIDE_RENDER_FAILURES: InjectionKey<(owner: symbol, failures: readonly SlideRenderFailure[]) => void>
  = Symbol('slideRenderFailures')
