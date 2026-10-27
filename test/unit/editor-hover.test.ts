import { describe, expect, it } from 'vitest'
import { referenceAt } from '../../layers/studio/src/utils/editor-hover'

const options = { lang: 'fr', docsUrl: (docs?: string) => docs && `https://docs.example.com${docs}` }

const raw = [
  '## Ce que disent les usagers',
  ':layout{media="right" alt="Une belle image"}',
  '::Quote{author="Une usagère"}',
  'Rendez-vous à 10:30.',
  '::Quot',
  '::',
].join('\n')

// The reference under the second letter of `word`, on the first line that holds it.
function at(word: string) {
  const lines = raw.split('\n')
  const index = lines.findIndex(line => line.includes(word))
  return referenceAt(raw, index + 1, lines[index]!.indexOf(word) + 1, options)
}

describe('referenceAt', () => {
  it('describes the component whose name is under the pointer, with its documentation', () => {
    expect(at('Quote')).toEqual({
      from: 0,
      to: 7,
      card: { syntax: '::Quote', label: 'Citation', description: 'Citation, avec son auteur', docs: 'https://docs.example.com/reference/nuxt#quote' },
    })
  })

  it('describes an annotation and an attribute of :layout with its values', () => {
    expect(at('layout')?.card).toMatchObject({ syntax: ':layout', label: 'Mise en page' })
    expect(at('media')?.card).toMatchObject({ syntax: 'media', values: ['right', 'left', 'top', 'bottom', 'behind'], docs: 'https://docs.example.com/ecrire/syntaxe#les-mises-en-page' })
  })

  it('leaves out the words of a quoted value, a time and an unknown name', () => {
    expect(at('belle')).toBeNull()
    expect(at('30')).toBeNull()
    expect(referenceAt(raw, 5, 3, options)).toBeNull()
  })
})
