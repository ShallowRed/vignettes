import { EditorState } from '@codemirror/state'
import { MEDIA_PLACEMENTS, MEDIA_SIZES } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { SKETCH_FRAME } from '../../layers/studio/src/config/editor-reference'
import { placementSketch, slideLayoutAt, slideLayoutChange } from '../../layers/studio/src/utils/editor-layout'
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

  it('reads no slide with the cursor in the frontmatter', () => {
    expect(slideLayoutAt(at(DECK, 2))).toMatchObject({ outside: true, attributes: {} })
    expect(slideLayoutAt(at(DECK, 9)).outside).toBe(false)
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

describe('placementSketch', () => {
  it('draws every placement inside the frame of the slide, at every size', () => {
    for (const at of ['none', ...MEDIA_PLACEMENTS] as const) {
      for (const size of MEDIA_SIZES) {
        const [p, q] = size.split('/').map(Number)
        for (const shape of placementSketch(at, p! / q!))
          expect(shape.x >= 0 && shape.width > 0 && shape.x + shape.width <= SKETCH_FRAME.width && shape.y + shape.height <= SKETCH_FRAME.height, `${at} ${size}`).toBe(true)
      }
    }
  })
})
