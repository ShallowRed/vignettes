import type { PresentationData } from '../../packages/nuxt/src/runtime/types/presentation.ts'
import { componentMentions, fragmentAtLine, registerDeckComponents, resetDeckComponents, slideRanges } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { headingParser } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'
import { slideAtLine, slidePlace, unknownDeckComponents } from '../../packages/nuxt/src/runtime/utils/slide-map.ts'

// Maps a 1-based line to reveal indices for a given deck source.
function at(raw: string, parser: 'heading' | 'separator', line: number) {
  return slideAtLine(slideRanges(raw, parser), line)
}

describe('slideRanges — heading parser', () => {
  const deck = [
    '---', // 1
    'title: X', // 2
    '---', // 3
    '# Title', // 4
    'intro', // 5
    '## Slide A', // 6
    'a content', // 7
    '## Slide B', // 8
    '### Sub 1', // 9
    '### Sub 2', // 10
    '---', // 11  (hr)
    'after hr', // 12
  ].join('\n')

  it('skips frontmatter and opens the title slide at the first heading', () => {
    expect(at(deck, 'heading', 4)).toEqual({ h: 0, v: 0 })
    expect(at(deck, 'heading', 5)).toEqual({ h: 0, v: 0 })
  })

  it('opens a horizontal slide on each h2', () => {
    expect(at(deck, 'heading', 6)).toEqual({ h: 1, v: 0 })
    expect(at(deck, 'heading', 7)).toEqual({ h: 1, v: 0 })
    expect(at(deck, 'heading', 8)).toEqual({ h: 2, v: 0 })
  })

  it('stacks h3 as vertical slides under the current horizontal', () => {
    expect(at(deck, 'heading', 9)).toEqual({ h: 2, v: 1 })
    expect(at(deck, 'heading', 10)).toEqual({ h: 2, v: 2 })
  })

  it('treats a horizontal rule as a new horizontal slide', () => {
    expect(at(deck, 'heading', 11)).toEqual({ h: 3, v: 0 })
    expect(at(deck, 'heading', 12)).toEqual({ h: 3, v: 0 })
  })

  it('ignores headings inside fenced code', () => {
    const fenced = ['# Title', '```', '## not a slide', '```', '## Real'].join('\n')
    expect(at(fenced, 'heading', 3)).toEqual({ h: 0, v: 0 })
    expect(at(fenced, 'heading', 5)).toEqual({ h: 1, v: 0 })
  })
})

describe('slideRanges — separator parser', () => {
  const deck = [
    '---', // 1
    'title: X', // 2
    'parser: separator', // 3
    '---', // 4
    'Intro slide', // 5
    '---', // 6
    'Second', // 7
    '----', // 8
    'Second-vertical', // 9
    '---', // 10
    'Third', // 11
  ].join('\n')

  it('opens a horizontal slide per --- and drops empty chunks', () => {
    expect(at(deck, 'separator', 5)).toEqual({ h: 0, v: 0 })
    expect(at(deck, 'separator', 7)).toEqual({ h: 1, v: 0 })
    expect(at(deck, 'separator', 11)).toEqual({ h: 2, v: 0 })
  })

  it('stacks ---- as vertical slides within a horizontal chunk', () => {
    expect(at(deck, 'separator', 9)).toEqual({ h: 1, v: 1 })
  })
})

describe('slideRanges — degenerate input', () => {
  it('returns a single slide for empty or frontmatter-only decks', () => {
    expect(slideRanges('', 'heading')).toEqual([{ startLine: 1, h: 0, v: 0 }])
    expect(slideRanges('---\ntitle: X\n---\n', 'separator')).toEqual([{ startLine: 4, h: 0, v: 0 }])
  })
})

describe('slidePlace', () => {
  it('finds a slide among the sections and their vertical slides, by identity', () => {
    const [first, second, third] = [{ body: 1 }, { body: 2 }, { body: 3 }]
    const slides = [first, { body: null, verticalSlides: [second, third] }]
    expect(slidePlace(slides, first)).toEqual({ h: 0, v: 0 })
    expect(slidePlace(slides, third)).toEqual({ h: 1, v: 1 })
    expect(slidePlace(slides, { ...third })).toBeUndefined()
  })
})

describe('fragmentAtLine', () => {
  beforeEach(() => registerDeckComponents(SCHEMA_COMPONENTS))

  const deck = [
    '---', // 1
    'parser: separator', // 2
    '---', // 3
    '### Tour', // 4
    ':::JsonTour{file="a.json"}', // 5
    '::Zone{lines="1-2" title="First"}', // 6
    'first', // 7
    '::', // 8
    '::Zone{lines="3" title="Second"}', // 9
    'second', // 10
    '::', // 11
    '```json', // 12
    '{}', // 13
    '```', // 14
    ':::', // 15
    '---', // 16
    ':::Scheme{:fragments="false"}', // 17
    '::Step{title="A"}', // 18
    '::', // 19
    ':::', // 20
    ':::Diagram', // 21
    '::Node{id="a" step="1"}', // 22
    '::', // 23
    '::Node{id="b" step="0"}', // 24
    '::', // 25
    '::Edge{from="a" to="b"}', // 26
    ':::', // 27
    '---', // 28
    '::Fragments', // 29
    '- one', // 30
    '- two', // 31
    '::', // 32
    '', // 33
    'after', // 34
    '---', // 35
    ':::Sequence', // 36
    '::Actor{id="a"}', // 37
    '::', // 38
    '::Message{from="a" to="a"}', // 39
    '::', // 40
    '::State{step="2" label="S"}', // 41
    '::', // 42
    '::Remark{step="1" over="a"}', // 43
    'note', // 44
    '::', // 45
    ':::', // 46
  ].join('\n')
  const ranges = slideRanges(deck, 'separator')
  const at = (line: number) => fragmentAtLine(deck, ranges, line)

  it('is -1 before the first fragment and on the container line', () => {
    expect(at(4)).toBe(-1)
    expect(at(5)).toBe(-1)
  })

  it('counts the zones of a tour in writing order, body and close included', () => {
    expect(at(6)).toBe(0)
    expect(at(8)).toBe(0)
    expect(at(9)).toBe(1)
    expect(at(13)).toBe(1)
  })

  it('counts nothing in a container with fragments off', () => {
    expect(at(18)).toBe(-1)
  })

  it('follows explicit steps and gives an edge the later of its nodes', () => {
    expect(at(22)).toBe(1)
    expect(at(24)).toBe(0)
    expect(at(26)).toBe(1)
  })

  it('counts the rows of a sequence, its participants left out', () => {
    expect(at(37)).toBe(-1)
    expect(at(39)).toBe(0)
    expect(at(41)).toBe(2)
    expect(at(44)).toBe(1)
  })

  it('counts each item of a fragments block and stops at its close', () => {
    expect(at(30)).toBe(0)
    expect(at(31)).toBe(1)
    expect(at(34)).toBe(1)
  })

  const withCode = [
    '::Fragments', // 1
    '- one', // 2
    '```md', // 3
    '- a', // 4
    '- b', // 5
    '```', // 6
    '- two', // 7
    'follows the list', // 8
    '::', // 9
    '---', // 10
    ':::Scheme', // 11
    '::Step{title="Syntax"}', // 12
    '```md', // 13
    '::Step{title="Example"}', // 14
    '::', // 15
    '```', // 16
    '::', // 17
    '::Step{title="Next"}', // 18
    '::', // 19
    ':::', // 20
  ].join('\n')
  const inCode = (line: number) => fragmentAtLine(withCode, slideRanges(withCode, 'separator'), line)

  it('counts a fenced code block of a fragments block as one step, its lines left out', () => {
    expect(inCode(3)).toBe(1)
    expect(inCode(5)).toBe(1)
    expect(inCode(7)).toBe(2)
    expect(inCode(8)).toBe(2)
  })

  it('counts two fenced code blocks of a fragments block written one after the other as two steps', () => {
    const raw = ['::Fragments', '```js', 'a', '```', '```js', 'b', '```', 'after', '::'].join('\n')
    const atRaw = (line: number) => fragmentAtLine(raw, slideRanges(raw, 'separator'), line)
    expect(atRaw(3)).toBe(0)
    expect(atRaw(5)).toBe(1)
    expect(atRaw(8)).toBe(2)
  })

  it('leaves out a component written in fenced code', () => {
    expect(inCode(14)).toBe(0)
    expect(inCode(18)).toBe(1)
  })
})

describe('unknownDeckComponents', () => {
  afterEach(() => resetDeckComponents())

  async function unknownIn(raw: string): Promise<string[]> {
    const data: PresentationData = { slides: await headingParser.parse(raw, {}), metadata: {} }
    return unknownDeckComponents(data)
  }

  it('names the components the slides draw as plain content', async () => {
    const raw = '# Title\n\n::Quote\nKept\n::\n\n## Two\n\n::Callout\nDropped\n::\n\nAn :badge{text="x"} inline'
    expect(await unknownIn(raw)).toEqual(['callout', 'badge'])
  })

  it('knows a component once it is registered, and the annotations the parser lifts', async () => {
    registerDeckComponents([{ name: 'Callout' }])
    expect(await unknownIn('# Title\n\n:subtitle{text="Sub"}\n\n::Callout\nKept\n::')).toEqual([])
  })

  it('knows the annotations of a vertical slide and names its unknown components', async () => {
    const raw = '## Section\n\n:slide-background{image="/a.svg"}\n\n### Sub\n\n:layout{name="media-right"}\n:quicklink{text="Back" href="/"}\n\n::Callout\nDropped\n::'
    expect(await unknownIn(raw)).toEqual(['callout'])
  })

  it('lets componentMentions place the annotations a slide keeps in its body, and those only', async () => {
    const raw = [
      '## Lifted',
      '',
      ':layout{media="right" src="/a.svg"}',
      'Text',
      ':subtitle{text="a"}',
      '',
      '## Kept',
      '',
      ':layout{media="right" src="/a.svg"}`',
      '',
      '::Columns',
      ':subtitle{text="b"}',
      '::',
      '',
      '- Item',
      '',
      '  :subtitle{text="c"}',
    ].join('\n')
    expect(componentMentions(raw, await unknownIn(raw)).map(mention => mention.line)).toEqual([9, 12, 17])
  })
})
