import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import metadata from '@iconify-json/ri/metadata.json'
import { describe, expect, it } from 'vitest'
import { SYMBOL_WORDS } from '../../layers/studio/src/config/symbol-words'
import { searchFold, searchTerms } from '../../layers/studio/src/utils/editor-symbols'

const icons = Object.values(metadata.categories as Record<string, string[]>).flat()
const root = join(import.meta.dirname, '../../public/pictograms')
const pictograms = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.svg'))
  .map(entry => relative(root, join(entry.parentPath, entry.name)))

describe('the words that find a symbol in the language of the author', () => {
  it('stand for parts of the names of the icons and the pictograms', () => {
    const names = [...icons, ...pictograms]
    const absent = Object.values(SYMBOL_WORDS).flatMap(words => Object.entries(words)
      .flatMap(([word, parts]) => parts.filter(part => !names.some(name => name.includes(part))).map(part => `${word} → ${part}`)))
    expect(absent).toEqual([])
  })
})

describe('the search of a symbol', () => {
  it('finds a word of the language of the author, its start and its plural, in the names', () => {
    expect(searchTerms('maison', 'fr')).toEqual(['maison', 'home', 'house'])
    expect(searchTerms('maisons', 'fr')).toContain('home')
    expect(searchTerms('mais', 'fr')).toContain('house')
    expect(searchTerms(searchFold('Flèche'), 'fr')).toContain('arrow')
    expect(searchTerms('coeur', 'fr')).toContain('heart')
    expect(searchTerms('shake hands', 'en')).toEqual(['shake hands'])
  })
})
