import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { previewSourceReader } from '../../layers/studio/src/utils/preview-header'
import { deckRange, editedText, followRange, keepsStructure, slideTextChange, textBlock } from '../../layers/studio/src/utils/preview-source'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

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

describe('editedText', () => {
  it('keeps a heading on one line, and escapes the marks that would close it', () => {
    expect(editedText('heading', '  Un titre\nsur deux lignes  ', 'Un titre')).toBe('Un titre sur deux lignes')
    expect(editedText('heading', '1. Introduction', 'Introduction')).toBe('1. Introduction')
    expect(editedText('heading', 'Langage C #', 'Langage C')).toBe('Langage C \\#')
  })

  it('keeps the hard breaks of a paragraph and drops its blank lines', () => {
    expect(editedText('paragraph', 'Avant  \naprès\n\n\nfin', 'Avant  \naprès')).toBe('Avant  \naprès\nfin')
    expect(editedText('paragraph', 'Un\r\ntexte', 'Un texte')).toBe('Un\ntexte')
  })

  it('escapes a line that would open a block, and keeps one that stays as written', () => {
    expect(editedText('paragraph', '- une puce', 'Un texte')).toBe('\\- une puce')
    expect(editedText('paragraph', 'Un texte\n---', 'Un texte')).toBe('Un texte\n\\---')
    expect(editedText('item', '- - x', 'x')).toBe('\\- - x')
    expect(editedText('underlined-heading', '## Titre', 'Titre')).toBe('\\## Titre')
    expect(editedText('paragraph', '<kbd>Ctrl</kbd> + C, puis V', '<kbd>Ctrl</kbd> + C')).toBe('<kbd>Ctrl</kbd> + C, puis V')
    expect(editedText('paragraph', 'Le bilan\n2. deux', 'Le texte\n2. deux')).toBe('Le bilan\n2. deux')
  })

  it('keeps the quote marks and the indentation of the lines after the first', () => {
    expect(editedText('paragraph', 'Une citation\n> et une autre suite', 'Une citation\n> et continue')).toBe('Une citation\n> et une autre suite')
    expect(editedText('paragraph', 'Une citation\net une autre suite', 'Une citation\n> et continue')).toBe('Une citation\n> et une autre suite')
    expect(editedText('paragraph', 'Une citation\n> - suite', 'Une citation\n> et continue')).toBe('Une citation\n> \\- suite')
    expect(editedText('item', 'ligne  \ndure et longue', 'ligne  \n  dure')).toBe('ligne  \n  dure et longue')
  })
})

describe('slideTextChange', () => {
  const doc = '## Titre\n\nUn texte.\n\n## Suite\n\nFin.\n'
  const range = { from: doc.indexOf('Un texte.'), to: doc.indexOf('Un texte.') + 9 }

  it('writes the text typed in place of the text written', () => {
    const change = slideTextChange(doc, range, 'Un texte.', 'Un autre texte.', 'paragraph', 'heading')
    expect(change).toEqual({ from: range.from, to: range.to, insert: 'Un autre texte.' })
  })

  it('writes nothing for a text unchanged or empty', () => {
    expect(slideTextChange(doc, range, 'Un texte.', '  Un texte.\n', 'paragraph', 'heading')).toBeUndefined()
    expect(slideTextChange(doc, range, 'Un texte.', ' \n ', 'paragraph', 'heading')).toBeUndefined()
  })

  it('refuses a text the document no longer holds', () => {
    expect(slideTextChange(doc.replace('Un texte.', 'Un texte modifié.'), range, 'Un texte.', 'Autre', 'paragraph', 'heading')).toBe('conflict')
  })

  it('keeps the paragraph and the slides of the deck, for each line that would open a block', async () => {
    const lines = ['## x', '# x', '---', '===', '- x', '1. x', '2. x', '> x', '```', '::Nom', '::', '<!-- x', '<div>', '<style>p{}', '| a |', '--|--', '[a]: /b', '[^1]: note', ':layout{media="right"}']
    const tags = async (text: string, parser: 'heading' | 'separator') =>
      (await PARSERS[parser].parse(text, {} as never)).map(slide => slide.body.children.map((node: any) => node.tag))
    for (const parser of ['heading', 'separator'] as const) {
      const before = await tags(doc, parser)
      for (const line of lines) {
        for (const typed of [line, `Un texte.\n${line}`]) {
          const change = slideTextChange(doc, range, 'Un texte.', typed, 'paragraph', parser)
          expect(typeof change, `${parser}: ${typed}`).toBe('object')
          const { from, to, insert } = change as { from: number, to: number, insert: string }
          expect(await tags(doc.slice(0, from) + insert + doc.slice(to), parser), `${parser}: ${typed}`).toEqual(before)
        }
      }
    }
  })
})

describe('keepsStructure', () => {
  it('tells a text that adds a slide or leaves a block open', () => {
    const doc = '## Titre\n\nUn texte.\n'
    expect(keepsStructure(doc, doc.replace('Un texte.', 'Un autre texte.'), 'heading')).toBe(true)
    expect(keepsStructure(doc, doc.replace('Un texte.', 'Un texte.\n\n## Suite'), 'heading')).toBe(false)
    expect(keepsStructure(doc, doc.replace('Un texte.', '::Nom\nUn texte.'), 'heading')).toBe(false)
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
    expect(slideTextChange(changed.state.doc.toString(), range, 'texte', 'texte modifié', 'paragraph', 'separator')).toBe('conflict')
  })
})
