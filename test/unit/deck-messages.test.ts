import { DECK_MESSAGES, deckMessages } from '@vignettes/core/render'
import { describe, expect, it } from 'vitest'

describe('deckMessages', () => {
  it('follows the language of the deck, whatever its region', () => {
    expect(deckMessages('en-GB').overview).toBe('Overview')
    expect(deckMessages('FR').overview).toBe('Vue d’ensemble')
  })

  it('is French for a deck without a language or with an unknown one', () => {
    expect(deckMessages()).toBe(DECK_MESSAGES.fr)
    expect(deckMessages('de')).toBe(DECK_MESSAGES.fr)
  })

  it('carries the same texts in every language', () => {
    expect(Object.keys(DECK_MESSAGES.en!).sort()).toEqual(Object.keys(DECK_MESSAGES.fr!).sort())
  })
})
