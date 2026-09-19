import type { DeckMessages } from '@vignettes/core/render'
import type { ComputedRef } from 'vue'
import { deckMessages } from '@vignettes/core/render'
import { computed, inject } from 'vue'
import { DECK_MESSAGES_KEY } from '../config/injection-keys.ts'

/** The chrome texts of the surrounding deck; French outside a deck. */
export function useDeckMessages(): ComputedRef<DeckMessages> {
  return inject(DECK_MESSAGES_KEY, computed(() => deckMessages()))
}
