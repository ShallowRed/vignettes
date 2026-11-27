import type { DeckProblem } from '@vignettes/core/deck'
import { readdirSync, readFileSync } from 'node:fs'
import { checkDeck, componentMentions, parserIdFor, PROBLEM_CODES, problemCode, registerDeckComponents, resetDeckComponents, splitFrontmatter, writtenComponentNames } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listedFrontmatterProblems } from '../../layers/studio/src/utils/editor-frontmatter'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'
import { unknownDeckComponents } from '../../packages/nuxt/src/runtime/utils/slide-map.ts'

const placed = (problem: DeckProblem) => [problem.check, problem.severity, problem.line]

describe('checkDeck', () => {
  it('finds the problems of each check, in the order of the text', () => {
    const raw = [
      '---',
      'title: A',
      'center: true',
      '---',
      '',
      '## Une image',
      ':layout{media="right"}',
      '',
      '::Quote{author="X}',
      '::',
      '',
      '::Fragments{efect="grow"}',
      '::',
      '',
      '::Image{src="javascript:alert(1)"}',
      '::',
      '',
      '::Columns',
      'Texte',
    ].join('\n')
    expect(checkDeck(raw).map(placed)).toEqual([
      ['legacy', 'info', 3],
      ['layout', 'error', 7],
      ['malformed', 'error', 9],
      ['component-attribute', 'warning', 12],
      ['refused', 'error', 15],
      ['unclosed', 'error', 18],
    ])
  })

  it('finds nothing in a deck written in the current format', () => {
    expect(checkDeck('---\ntitle: A\n---\n\n## Une diapositive\n\nTexte\n')).toEqual([])
  })

  it('places a frontmatter refusal on the line of its key, or of its nearest parent written on a line', () => {
    const raw = '---\ntitle: A\nstorybook: "javascript:alert(1)"\nreveal:\n  width: large\n  dependencies:\n    - src: "data:text/javascript,x"\n---\n'
    expect(checkDeck(raw).map(problem => [...placed(problem), problem.check === 'frontmatter' && problem.key])).toEqual([
      ['frontmatter', 'error', 3, 'storybook'],
      ['frontmatter', 'error', 5, 'reveal.width'],
    ])
  })

  it('places a missing title on the first line, an unreadable YAML block where the parser stops, and an unclosed block on its heading', () => {
    expect(checkDeck('## Sans titre\n').map(placed)).toEqual([['frontmatter', 'error', 1]])
    expect(checkDeck('---\ntitle: A\nlang: fr\n  theme: dsfr\n---\n').map(placed)).toEqual([['frontmatter', 'error', 4]])
    expect(checkDeck('---\ntitle: [A\n---\n').map(placed)).toEqual([['frontmatter', 'error', 2]])
    expect(checkDeck('---\ntitle: A\n\n# Titre\n\n---\n## Suite\n').map(placed)).toEqual([['frontmatter', 'error', 4]])
  })

  it('writes nothing to the console', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method => vi.spyOn(console, method))
    checkDeck('---\ntitle: [A\n---\n')
    checkDeck('---\ntheme: [A]\n---\n')
    try {
      expect(spies.flatMap(spy => spy.mock.calls)).toEqual([])
    }
    finally {
      spies.forEach(spy => spy.mockRestore())
    }
  })

  it('reports a theme absent from the themes of the repository as an info, on its line', () => {
    expect(checkDeck('---\ntitle: A\ntheme: maison\n---\n').map(problem => [...placed(problem), problem.check === 'unknown-theme' && problem.theme])).toEqual([
      ['unknown-theme', 'info', 3, 'maison'],
    ])
  })

  it('reports an unknown component as a warning, wherever it is written', () => {
    const raw = '---\ntitle: A\n---\n\n## Un\n\n::Callout\nTexte\n::\n\nUn :badge{text="x"} et :Callout\n'
    expect(checkDeck(raw).map(problem => [...placed(problem), problem.column])).toEqual([
      ['unknown-component', 'warning', 7, 0],
      ['unknown-component', 'warning', 11, 3],
      ['unknown-component', 'warning', 11, 23],
    ])
  })

  it('names one public code for each problem', () => {
    expect(Object.values(PROBLEM_CODES).flatMap(code => typeof code === 'string' ? [code] : Object.values(code))).toEqual([
      'malformed',
      'component-attribute',
      'unclosed',
      'refused',
      'layout-unknown-attribute',
      'layout-invalid-value',
      'layout-missing-source',
      'layout-unused',
      'layout-behind-needs-image',
      'legacy',
      'frontmatter',
      'unknown-component',
      'unknown-theme',
    ])
    expect(checkDeck('---\ntitle: A\n---\n\n:layout{media="right"}\n').map(problemCode)).toEqual(['layout-missing-source'])
  })
})

describe('writtenComponentNames', () => {
  it('leaves out the HTML elements, the directives of a {…} block and the annotations the parser lifts', () => {
    const raw = '## Un\n\n:subtitle{text="a"}\n\n::div\n::\n\nUn :Strong[mot], un :TBody et [lien]{.a :href="x"}\n\n::Scheme{:arrows="false"}\n::\n\n:badge{text="a :inner b"}\n'
    expect(writtenComponentNames(raw)).toEqual(['TBody', 'Scheme', 'badge'])
  })
})

describe('checkDeck and the checks of the editor and the render', () => {
  const decks = [
    ...readdirSync('test/unit/fixtures').map(name => `test/unit/fixtures/${name}`),
    ...readdirSync('test/e2e/fixtures/decks').map(name => `test/e2e/fixtures/decks/${name}`),
  ].filter(path => path.endsWith('.md'))

  beforeEach(() => registerDeckComponents([...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS]))
  afterEach(() => resetDeckComponents())

  it.each(decks)('find the same unknown components and refused frontmatter keys in %s', async (path) => {
    const raw = readFileSync(path, 'utf8')
    const metadata = splitFrontmatter(raw).data
    const slides = await PARSERS[parserIdFor(metadata)].parse(raw, metadata)
    const problems = checkDeck(raw)
    const place = ({ line, column, length }: { line: number, column: number, length: number }) => [line, column, length]
    expect(problems.filter(problem => problem.check === 'unknown-component').map(place))
      .toEqual(componentMentions(raw, unknownDeckComponents({ slides, metadata })).map(place))
    expect(problems.filter(problem => problem.check === 'frontmatter').map(problem => problem.line))
      .toEqual(listedFrontmatterProblems(raw, key => key).filter(problem => problem.severity === 'error').map(problem => problem.line))
  })
})
