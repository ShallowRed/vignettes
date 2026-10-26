import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { slideLayoutAt, slideLayoutChange } from '../../layers/studio/src/utils/editor-layout'
import { deckStructure } from '../../layers/studio/src/utils/editor-slides'

const DECK = '---\ntitle: Essai\n---\n\n## Un\n\n:layout{media="left" src="/a.png"}\n\nTexte.\n\n---\n\n## Deux\n\nTexte.\n'

function at(doc: string, line: number) {
  const state = EditorState.create({ doc, extensions: deckStructure((key: string) => key) })
  return state.update({ selection: { anchor: state.doc.line(line).from } }).state
}

function applied(state: EditorState, attributes: Record<string, unknown>) {
  return state.update(slideLayoutChange(state, attributes)).state.doc.toString()
}

describe('slideLayoutAt', () => {
  it('reads the annotation of the slide under the cursor', () => {
    expect(slideLayoutAt(at(DECK, 9))).toMatchObject({ attributes: { media: 'left', src: '/a.png' }, legacy: false })
    expect(slideLayoutAt(at(DECK, 15)).annotation).toBeUndefined()
  })

  it('reads an annotation of the decks written before media and size in its current form', () => {
    const doc = '## Un\n\n:layout{name="media-right-xwide" story="a--b" previewWidth="1600"}\n'
    expect(slideLayoutAt(at(doc, 1))).toMatchObject({ attributes: { media: 'right', size: '3/4', story: 'a--b', viewport: '1600' }, legacy: true })
  })
})

describe('slideLayoutChange', () => {
  it('rewrites the annotation', () => {
    expect(applied(at(DECK, 9), { media: 'right', size: '2/3', src: '/a.png' })).toContain(':layout{media="right" size="2/3" src="/a.png"}\n\nTexte.')
  })

  it('writes an annotation under the heading of a slide without one', () => {
    expect(applied(at(DECK, 15), { align: 'top' })).toContain('## Deux\n\n:layout{align="top"}\n\nTexte.')
  })

  it('removes the annotation and its blank line when no attribute is left', () => {
    expect(applied(at(DECK, 9), {})).toContain('## Un\n\nTexte.')
  })

  it('sets the annotation apart from a text right under the heading', () => {
    expect(applied(at('## Un\nTexte.\n', 2), { align: 'top' })).toBe('## Un\n\n:layout{align="top"}\n\nTexte.\n')
  })

  it('writes an annotation after the separator of a slide without a heading', () => {
    expect(applied(at('## Un\n\nTexte.\n\n---\n\nTexte seul.\n', 7), { heading: 'hidden' }))
      .toBe('## Un\n\nTexte.\n\n---\n\n:layout{heading="hidden"}\n\nTexte seul.\n')
  })

  it('writes the annotation of the first slide when the cursor is in the frontmatter', () => {
    expect(applied(at('---\ntitle: Essai\n---\n\nTexte seul.\n', 2), { heading: 'hidden' }))
      .toBe('---\ntitle: Essai\n---\n\n:layout{heading="hidden"}\n\nTexte seul.\n')
  })

  it('writes an annotation at the start of a slide without a heading', () => {
    expect(applied(at('Texte seul.\n', 1), { heading: 'hidden' })).toBe(':layout{heading="hidden"}\n\nTexte seul.\n')
  })
})
