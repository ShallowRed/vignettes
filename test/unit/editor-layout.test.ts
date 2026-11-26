import type { TextStep } from '@vignettes/core/deck'
import { history, undo } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { MEDIA_PLACEMENTS, MEDIA_SIZES, PLACEHOLDER_IMAGE, registerDeckComponents, resetDeckComponents, TEXT_STEPS } from '@vignettes/core/deck'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { SKETCH_FRAME } from '../../layers/studio/src/config/editor-reference'
import { blockedPlacements, layoutCandidates, placementSketch, proposalSteps, slideLayoutAt, slideLayoutChange, slideLayoutProposal, slideMediaAt, slidePlacementChange } from '../../layers/studio/src/utils/editor-layout'
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

  it('reads the frontmatter as the deck parser reads it', () => {
    const notFrontmatter = '--- \ntitle: Essai\n---\n\n## Un\n'
    expect(slideLayoutAt(at(notFrontmatter, 2)).outside).toBe(false)
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

describe('the settings the panel measures', () => {
  afterEach(() => resetDeckComponents())

  const BODY = '## Un\n\nTexte.\n\n![Une vue](/a.png)\n\n## Deux\n'

  it('measures each size of a media of the body, which goes to the right of the text, as the click writes it', () => {
    const state = at(BODY, 3)
    const { sizes } = layoutCandidates(state)
    expect(Object.keys(sizes)).toEqual([...MEDIA_SIZES])
    for (const [size, candidate] of Object.entries(sizes)) {
      expect(state.update(candidate.change).state.doc.toString())
        .toBe(`## Un\n\n:layout{media="right" size="${size}" src="/a.png" alt="Une vue"}\n\nTexte.\n\n## Deux\n`)
    }
  })

  it('measures each step of the text with the media of the body in its place', () => {
    const state = at(BODY, 3)
    const { steps } = layoutCandidates(state)
    expect(Object.keys(steps)).toEqual([...TEXT_STEPS])
    expect(state.update(steps.sm!.change).state.doc.toString()).toBe('## Un\n\n:layout{text="sm"}\n\nTexte.\n\n![Une vue](/a.png)\n\n## Deux\n')
    expect(state.update(steps.md!.change).state.doc.toString()).toBe(BODY)
  })

  it('writes a setting in one transaction, undone at once', () => {
    const state = EditorState.create({ doc: BODY, extensions: [deckStructure((key: string) => key), history()] })
    const cursor = state.update({ selection: { anchor: state.doc.line(3).from } }).state
    const half = layoutCandidates(cursor).sizes['1/2']!
    const clicked = cursor.update(slideLayoutProposal(cursor, half.attributes)).state
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
    const third = layoutCandidates(at(doc, 5)).sizes['1/3']!
    expect(at(doc, 5).update(third.change).state.doc.toString())
      .toBe('## Un\n\n:layout{media="left" size="1/3" src="/a.png" fit="contain" position="top" alt="Une vue" lightbox hint="Cliquez" viewport="1280" align="top" heading="compact"}\n\nTexte.\n')
  })

  it('moves a media of the body into a :layout line the slide already has', () => {
    const doc = '## Un\n\n:layout{align="top"}\n\nTexte.\n\n![Une vue](/a.png)\n'
    const half = layoutCandidates(at(doc, 5)).sizes['1/2']!
    expect(at(doc, 5).update(half.change).state.doc.toString())
      .toBe('## Un\n\n:layout{media="right" size="1/2" src="/a.png" alt="Une vue" align="top"}\n\nTexte.\n')
  })

  it('measures no size for a media it cannot move or a slide with several media, and the steps still', () => {
    const captioned = at('## Un\n\n::Image[Une légende]{src="/a.png"}\n::\n', 1)
    expect(slideMediaAt(captioned)?.proposable).toBe(false)
    expect(layoutCandidates(captioned).sizes).toEqual({})
    expect(Object.keys(layoutCandidates(captioned).steps)).toEqual([...TEXT_STEPS])
    expect(slideMediaAt(at('## Un\n\n:layout{src="/a.png"}\n\n![b](/b.png)\n', 1))?.proposable).toBe(false)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const twoMedia = at('## Un\n\n![a](/a.png)\n\n::StoryFrame{story="page--home"}\n::\n', 1)
    expect(slideMediaAt(twoMedia)?.proposable).toBe(false)
    expect(layoutCandidates(twoMedia).sizes).toEqual({})
    expect(blockedPlacements(twoMedia).right).toBe('several')
    expect(blockedPlacements(captioned).right).toBe('kept')
  })

  it('measures the sizes of a media above or below the text, none behind it, and no step for screens', () => {
    expect(Object.keys(layoutCandidates(at('## Un\n\n:layout{media="bottom" size="1/2" src="/a.png"}\n\nTexte.\n', 1)).sizes)).toEqual([...MEDIA_SIZES])
    expect(layoutCandidates(at('## Un\n\n:layout{media="behind" src="/a.png"}\n', 1)).sizes).toEqual({})
    expect(layoutCandidates(at('## Un\n\n:layout{screen}\n\nTexte.\n', 1)).steps).toEqual({})
  })
})

describe('slidePlacementChange', () => {
  it('moves a media of the body into :layout at the placement chosen', () => {
    const doc = '## Un\n\nTexte.\n\n![Une vue](/a.png)\n'
    expect(at(doc, 3).update(slidePlacementChange(at(doc, 3), 'left')).state.doc.toString())
      .toBe('## Un\n\n:layout{media="left" src="/a.png" alt="Une vue"}\n\nTexte.\n')
  })

  it('gives a slide without a media the placeholder image', () => {
    const doc = '## Un\n\nTexte.\n'
    expect(at(doc, 3).update(slidePlacementChange(at(doc, 3), 'right')).state.doc.toString())
      .toBe(`## Un\n\n:layout{media="right" src="${PLACEHOLDER_IMAGE}"}\n\nTexte.\n`)
  })

  it('moves the media of :layout alone', () => {
    const written = '## Un\n\n:layout{media="right" src="/a.png"}\n\nTexte.\n'
    expect(at(written, 5).update(slidePlacementChange(at(written, 5), 'bottom')).state.doc.toString()).toBe('## Un\n\n:layout{media="bottom" src="/a.png"}\n\nTexte.\n')
  })

  it('gives a :layout placement without a source the placeholder image', () => {
    const written = '## Un\n\n:layout{media="right"}\n\nTexte.\n'
    expect(at(written, 5).update(slidePlacementChange(at(written, 5), 'left')).state.doc.toString())
      .toBe(`## Un\n\n:layout{media="left" src="${PLACEHOLDER_IMAGE}"}\n\nTexte.\n`)
  })

  it('leaves the slide as it is for a placement its media of the body cannot take', () => {
    const captioned = '## Un\n\nTexte.\n\n::Image[Une légende]{src="/a.png"}\n::\n'
    expect(blockedPlacements(at(captioned, 3)).right).toBe('kept')
    expect(at(captioned, 3).update(slidePlacementChange(at(captioned, 3), 'right')).state.doc.toString()).toBe(captioned)
    const page = '## Un\n\nTexte.\n\n::Iframe{src="https://exemple.fr"}\n::\n'
    expect(blockedPlacements(at(page, 3))).toEqual({ behind: 'not-behind' })
    expect(at(page, 3).update(slidePlacementChange(at(page, 3), 'behind')).state.doc.toString()).toBe(page)
    expect(at(page, 3).update(slidePlacementChange(at(page, 3), 'right')).state.doc.toString()).toBe('## Un\n\n:layout{media="right" src="https://exemple.fr"}\n\nTexte.\n')
  })
})

describe('proposalSteps', () => {
  /** The size of the body at the step of these attributes, from 24 pixels, over a floor. */
  const sized = (attributes: Record<string, unknown>, floor = 0) => Math.max(floor, 24 * 1.125 ** (TEXT_STEPS.indexOf((attributes.text as TextStep | undefined) ?? 'md') - 2))
  const reading = (overflow: number, bodySize = 24, fill = 0.8) => ({ overflow, bodySize, textScale: 1, fill, ratio: 1.125 })

  /** Walks the path with the readings `answer` gives, and returns the proposal and the settings measured. */
  function walk(doc: string, line: number, answer: (attributes: Record<string, unknown>) => ReturnType<typeof reading>) {
    const path = proposalSteps(at(doc, line))
    const measured: string[] = []
    let step = path.next()
    while (!step.done) {
      measured.push(step.value.key)
      step = path.next(answer(step.value.attributes))
    }
    return { proposal: step.value, measured }
  }

  const BODY = '## Un\n\nTexte.\n\n![Une vue](/a.png)\n'
  const PLAIN = '## Un\n\nTexte.\n'

  it('proposes nothing when the text fits, and the step above for a short text that fits at it', () => {
    expect(walk(PLAIN, 3, () => reading(0)).proposal).toBeUndefined()
    expect(walk(PLAIN, 3, () => reading(OVERFLOW_THRESHOLD)).proposal).toBeUndefined()
    expect(walk(PLAIN, 3, () => reading(0, 24, 0.3)).proposal).toEqual({ kind: 'layout', attributes: { text: 'lg' }, grow: true })
    expect(walk(PLAIN, 3, attributes => reading(attributes.text === 'lg' ? 20 : 0, 24, 0.3)).proposal).toBeUndefined()
    expect(walk('## Un\n\n:layout{text="sm"}\n\nTexte.\n', 5, () => reading(0, 24, 0.3)).proposal).toBeUndefined()
  })

  it('moves an image of the body beside the text at the half of the slide, else its third', () => {
    expect(walk(BODY, 3, attributes => reading(attributes.media ? 0 : 40)).proposal)
      .toEqual({ kind: 'layout', attributes: { media: 'right', size: '1/2', src: '/a.png', alt: 'Une vue' } })
    expect(walk(BODY, 3, attributes => reading(attributes.size === '1/3' ? 0 : 40)).proposal)
      .toEqual({ kind: 'layout', attributes: { media: 'right', size: '1/3', src: '/a.png', alt: 'Une vue' } })
  })

  it('goes on with a heading on one line, a smaller step, the tight inset and a second step, keeping each change', () => {
    const fitsWith = (name: string, value: unknown) => (attributes: Record<string, unknown>) => reading(attributes[name] === value ? 0 : 40, sized(attributes))
    expect(walk(BODY, 3, fitsWith('heading', 'compact')).proposal)
      .toEqual({ kind: 'layout', attributes: { media: 'right', size: '1/3', src: '/a.png', alt: 'Une vue', heading: 'compact' } })
    expect(walk(PLAIN, 3, fitsWith('text', 'sm')).proposal).toEqual({ kind: 'layout', attributes: { text: 'sm', heading: 'compact' } })
    expect(walk(PLAIN, 3, fitsWith('inset', 'tight')).proposal).toEqual({ kind: 'layout', attributes: { text: 'sm', heading: 'compact', inset: 'tight' } })
    expect(walk(PLAIN, 3, fitsWith('text', 'xs')).proposal).toEqual({ kind: 'layout', attributes: { text: 'xs', heading: 'compact', inset: 'tight' } })
    expect(walk(PLAIN, 3, attributes => reading(40, sized(attributes))).proposal).toEqual({ kind: 'too-long' })
  })

  it('passes every step that the floor of the theme holds', () => {
    const { proposal, measured } = walk(PLAIN, 3, attributes => reading(attributes.inset ? 0 : 40, sized(attributes, 23.5)))
    expect(proposal).toEqual({ kind: 'layout', attributes: { heading: 'compact', inset: 'tight' } })
    expect(measured).toContain(':layout{text="sm" heading="compact"}')
    expect(measured.some(key => key.includes('text="xs"'))).toBe(false)
  })

  it('proposes no step for a slide without a body', () => {
    expect(walk('## Un titre seul\n', 1, () => reading(0, 0, 0)).proposal).toBeUndefined()
    const { proposal, measured } = walk('## Un titre seul\n', 1, attributes => reading(attributes.inset ? 0 : 40, 0, 0))
    expect(proposal).toEqual({ kind: 'layout', attributes: { heading: 'compact', inset: 'tight' } })
    expect(measured.some(key => key.includes('text='))).toBe(false)
  })

  it('reads a slide of screens as the parser does', () => {
    expect(walk('## Un\n\n:layout{screen="false"}\n\nTexte.\n', 5, () => reading(0, 24, 0.3)).proposal).toEqual({ kind: 'layout', attributes: { screen: 'false', text: 'lg' }, grow: true })
    expect(Object.keys(layoutCandidates(at('## Un\n\n:layout{screen="false"}\n\nTexte.\n', 5)).steps)).toEqual([...TEXT_STEPS])
  })

  it('keeps a media of the body in its place when the proposal is a step of the text', () => {
    const state = at(BODY, 3)
    const { proposal } = walk(BODY, 3, () => reading(0, 24, 0.3))
    expect(proposal).toEqual({ kind: 'layout', attributes: { text: 'lg' }, grow: true })
    expect(state.update(slideLayoutProposal(state, { text: 'lg' })).state.doc.toString()).toBe('## Un\n\n:layout{text="lg"}\n\nTexte.\n\n![Une vue](/a.png)\n')
  })

  it('leaves out the size of a media above or below the text, or that it cannot move, and the inset written', () => {
    const above = walk('## Un\n\n:layout{media="top" src="/a.png"}\n\nTexte.\n', 5, attributes => reading(40, sized(attributes)))
    expect(above.measured.some(key => key.includes('size='))).toBe(false)
    const below = walk('## Un\n\n:layout{media="bottom" size="1/2" src="/a.png" inset="tight"}\n\nTexte.\n', 5, attributes => reading(40, sized(attributes)))
    expect(below.measured.slice(1).every(key => key.includes('size="1/2"'))).toBe(true)
    expect(below.measured[1]).toContain('heading="compact"')
    expect(below.measured.filter(key => key.includes('inset="tight"'))).toHaveLength(below.measured.length)
    const captioned = walk('## Un\n\nTexte.\n\n::Image[Une légende]{src="/a.png"}\n::\n', 3, attributes => reading(40, sized(attributes)))
    expect(captioned.measured.some(key => key.includes('media='))).toBe(false)
  })

  it('proposes neither a larger step nor a step, a heading or an inset for a slide of screens', () => {
    const screens = '## Un\n\n:layout{screen}\n\nTexte.\n'
    expect(walk(screens, 5, () => reading(0, 24, 0.3)).proposal).toBeUndefined()
    const { proposal, measured } = walk(screens, 5, () => reading(40))
    expect(proposal).toEqual({ kind: 'too-long' })
    expect(measured).toEqual([':layout{screen}'])
  })

  it('tries only the smaller sizes of a media of :layout, and keeps a heading the author wrote', () => {
    const { measured } = walk('## Un\n\n:layout{media="right" size="3/4" src="https://exemple.fr" heading="hidden"}\n\nTexte.\n', 5, attributes => reading(40, sized(attributes)))
    expect(measured).toEqual([
      ':layout{media="right" size="3/4" src="https://exemple.fr" heading="hidden"}',
      ':layout{media="right" size="2/3" src="https://exemple.fr" heading="hidden"}',
      ':layout{media="right" size="1/2" src="https://exemple.fr" heading="hidden"}',
      ':layout{media="right" size="1/2" src="https://exemple.fr" text="sm" heading="hidden"}',
      ':layout{media="right" size="1/2" src="https://exemple.fr" text="sm" inset="tight" heading="hidden"}',
      ':layout{media="right" size="1/2" src="https://exemple.fr" text="xs" inset="tight" heading="hidden"}',
    ])
    expect(measured.some(key => key.includes('heading="compact"'))).toBe(false)
  })
})
