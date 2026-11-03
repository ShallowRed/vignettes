import { checkDeck } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

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
    expect(checkDeck(raw).map(problem => [problem.check, problem.severity, problem.line])).toEqual([
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
})
