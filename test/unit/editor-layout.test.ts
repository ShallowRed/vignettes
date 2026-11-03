import { history, undo } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { MEDIA_PLACEMENTS, MEDIA_SIZES, registerDeckComponents, resetDeckComponents } from '@vignettes/core/deck'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { SKETCH_FRAME } from '../../layers/studio/src/config/editor-reference'
import { layoutCandidates, placementSketch, proposeLayout, slideLayoutAt, slideLayoutChange, slideLayoutProposal, slideMediaAt } from '../../layers/studio/src/utils/editor-layout'
import { deckStructure } from '../../layers/studio/src/utils/editor-slides'
import { OVERFLOW_THRESHOLD } from '../../layers/studio/src/utils/preview-overflow'

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

describe('the layout the panel proposes', () => {
  afterEach(() => resetDeckComponents())

  const BODY = '## Un\n\nTexte.\n\n![Une vue](/a.png)\n\n## Deux\n'

  it('measures each size of a media of the body, which goes to the right of the text, as the click writes it', () => {
    const state = at(BODY, 3)
    const candidates = layoutCandidates(state)
    expect(candidates.map(candidate => candidate.size)).toEqual([...MEDIA_SIZES])
    for (const candidate of candidates) {
      expect(state.update(candidate.change).state.doc.toString())
        .toBe(`## Un\n\n:layout{media="right" size="${candidate.size}" src="/a.png" alt="Une vue"}\n\nTexte.\n\n## Deux\n`)
    }
  })

  it('writes the change in one transaction, undone at once', () => {
    const state = EditorState.create({ doc: BODY, extensions: [deckStructure((key: string) => key), history()] })
    const cursor = state.update({ selection: { anchor: state.doc.line(3).from } }).state
    const [candidate] = layoutCandidates(cursor)
    const clicked = cursor.update(slideLayoutProposal(cursor, candidate!.attributes)).state
    let undone = clicked
    undo({
      state: clicked,
      dispatch: (transaction) => {
        undone = transaction.state
      },
    })
    expect(undone.doc.toString()).toBe(BODY)
  })

  it('keeps the settings written in :layout and changes the size alone', () => {
    const doc = '## Un\n\n:layout{media="left" src="/a.png" fit="contain" position="top" alt="Une vue" lightbox hint="Cliquez" viewport="1280" align="top" heading="compact"}\n\nTexte.\n'
    const [third] = layoutCandidates(at(doc, 5))
    expect(at(doc, 5).update(third!.change).state.doc.toString())
      .toBe('## Un\n\n:layout{media="left" size="1/3" src="/a.png" fit="contain" position="top" alt="Une vue" lightbox hint="Cliquez" viewport="1280" align="top" heading="compact"}\n\nTexte.\n')
  })

  it('moves a media of the body into a :layout line the slide already has', () => {
    const doc = '## Un\n\n:layout{align="top"}\n\nTexte.\n\n![Une vue](/a.png)\n'
    const half = layoutCandidates(at(doc, 5)).find(candidate => candidate.size === '1/2')!
    expect(at(doc, 5).update(half.change).state.doc.toString())
      .toBe('## Un\n\n:layout{media="right" size="1/2" src="/a.png" alt="Une vue" align="top"}\n\nTexte.\n')
  })

  it('proposes nothing for a media it cannot move or a slide with several media', () => {
    expect(slideMediaAt(at('## Un\n\n::Image[Une légende]{src="/a.png"}\n::\n', 1))?.proposable).toBe(false)
    expect(layoutCandidates(at('## Un\n\n::Image[Une légende]{src="/a.png"}\n::\n', 1))).toEqual([])
    expect(slideMediaAt(at('## Un\n\n:layout{src="/a.png"}\n\n![b](/b.png)\n', 1))?.proposable).toBe(false)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const twoMedia = at('## Un\n\n![a](/a.png)\n\n::StoryFrame{story="page--home"}\n::\n', 1)
    expect(slideMediaAt(twoMedia)?.proposable).toBe(false)
    expect(layoutCandidates(twoMedia)).toEqual([])
  })

  it('measures the sizes of a media above or below the text without proposing one', () => {
    const state = at('## Un\n\n:layout{media="bottom" size="1/2" src="/a.png"}\n\nTexte.\n', 1)
    expect(layoutCandidates(state)).toHaveLength(MEDIA_SIZES.length)
    expect(slideMediaAt(state)?.proposable).toBe(false)
    expect(slideMediaAt(at('## Un\n\n:layout{media="top" src="/a.png"}\n\nTexte.\n', 1))?.proposable).toBe(false)
    expect(layoutCandidates(at('## Un\n\n:layout{media="behind" src="/a.png"}\n', 1))).toEqual([])
  })

  const fit = { overflow: 0, textScale: 1 }
  const over = { overflow: 40, textScale: 1 }
  const image = slideMediaAt(at(BODY, 3))!
  const page = slideMediaAt(at('## Un\n\n:layout{media="right" src="https://exemple.fr"}\n', 1))!

  it('proposes the half for an image, else its third, else says the text is too long', () => {
    expect(proposeLayout(image, undefined, { '1/2': fit, '1/3': fit })).toEqual({ kind: 'size', size: '1/2' })
    expect(proposeLayout(image, undefined, { '1/2': over, '1/3': fit })).toEqual({ kind: 'size', size: '1/3' })
    expect(proposeLayout(image, undefined, { '1/2': over, '1/3': over })).toEqual({ kind: 'too-long' })
  })

  it('proposes two thirds for a page or a story, else the half, and nothing when the written size fits', () => {
    expect(proposeLayout(page, undefined, { '1/2': over, '2/3': over })).toEqual({ kind: 'too-long' })
    expect(proposeLayout(page, '3/4', { '3/4': over, '2/3': fit })).toEqual({ kind: 'size', size: '2/3' })
    expect(proposeLayout(page, '3/4', { '3/4': over, '2/3': over, '1/2': fit })).toEqual({ kind: 'size', size: '1/2' })
    expect(proposeLayout(page, '3/4', { '3/4': fit })).toBeUndefined()
    expect(proposeLayout(page, undefined, { '1/2': { overflow: OVERFLOW_THRESHOLD, textScale: 1 } })).toBeUndefined()
  })
})
