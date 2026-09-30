import { describe, expect, it } from 'vitest'
import { fragmentAtLine, slideAtLine, slideRanges } from '../../packages/nuxt/src/runtime/utils/slide-map.ts'

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

describe('fragmentAtLine', () => {
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

  it('counts each item of a fragments block and stops at its close', () => {
    expect(at(30)).toBe(0)
    expect(at(31)).toBe(1)
    expect(at(34)).toBe(1)
  })
})
