import { EditorState } from '@codemirror/state'
import { typedTextChange } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { previewSourceReader } from '../../layers/studio/src/utils/preview-header'
import { deckRange, followRange, textBlock } from '../../layers/studio/src/utils/preview-source'

const DECK = '---\ntitle: Essai\n---\n\n## Un\n\nPremier texte.\n\n## Deux\n\nSecond texte.\n'
// `Second texte.` in the text of the second slide, as `splitSlides` cuts it.
const SECOND = { from: 9, to: 22 }

describe('deckRange', () => {
  it('places a range of the slide in the text of the editor', () => {
    const range = deckRange(DECK, DECK, 'heading', { h: 1, v: 0 }, SECOND)!
    expect(DECK.slice(range.from, range.to)).toBe('Second texte.')
  })

  it('follows the slide when the text before it changes', () => {
    const current = DECK.replace('Premier texte.', 'Premier texte, plus long.')
    const range = deckRange(DECK, current, 'heading', { h: 1, v: 0 }, SECOND)!
    expect(current.slice(range.from, range.to)).toBe('Second texte.')
  })

  it('gives nothing once the slide changed, or another slide came before it', () => {
    expect(deckRange(DECK, DECK.replace('Second', 'Autre'), 'heading', { h: 1, v: 0 }, SECOND)).toBeUndefined()
    expect(deckRange(DECK, DECK.replace('## Deux', '## Nouvelle\n\n## Deux'), 'heading', { h: 1, v: 0 }, SECOND)).toBeUndefined()
    expect(deckRange(DECK, DECK, 'heading', { h: 2, v: 0 }, SECOND)).toBeUndefined()
  })

  it('gives nothing for a range past the slide', () => {
    expect(deckRange(DECK, DECK, 'heading', { h: 1, v: 0 }, { from: 9, to: 400 })).toBeUndefined()
  })

  it('places a range of a preview that kept the last header that parsed', () => {
    const read = previewSourceReader()
    read(DECK)
    const broken = DECK.replace('title: Essai', 'title: [Essai')
    const range = deckRange(read(broken), broken, 'heading', { h: 1, v: 0 }, SECOND)!
    expect(broken.slice(range.from, range.to)).toBe('Second texte.')
  })
})

describe('textBlock', () => {
  it('tells a heading with marks from an underlined one, a paragraph and a list item', () => {
    expect(textBlock('H2', '## Titre')).toBe('heading')
    expect(textBlock('H1', 'Titre\n===')).toBe('underlined-heading')
    expect(textBlock('P', 'Texte')).toBe('paragraph')
    expect(textBlock('LI', '- Texte')).toBe('item')
  })
})

describe('followRange', () => {
  const doc = 'avant [texte] après'
  const range = { from: 7, to: 12 }
  const moved = (from: number, to: number, insert: string) =>
    followRange(range, EditorState.create({ doc }).update({ changes: { from, to, insert } }).changes)

  it('moves the range with a change before it, and keeps out a text inserted at its ends', () => {
    expect(moved(0, 0, '++')).toEqual({ from: 9, to: 14 })
    expect(moved(7, 7, '++')).toEqual({ from: 9, to: 14 })
    expect(moved(12, 12, '++')).toEqual({ from: 7, to: 12 })
    expect(moved(14, 14, '++')).toEqual({ from: 7, to: 12 })
  })

  it('takes in a change inside the range, where the written text then differs', () => {
    const changed = EditorState.create({ doc }).update({ changes: { from: 9, to: 10, insert: 'X' } })
    const range = followRange({ from: 7, to: 12 }, changed.changes)
    expect(range).toEqual({ from: 7, to: 12 })
    expect(typedTextChange(changed.state.doc.toString(), range, 'texte', 'texte modifié', 'paragraph', 'separator')).toBe('conflict')
  })
})
