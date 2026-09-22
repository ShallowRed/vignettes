import { describe, expect, it } from 'vitest'
import { renameTheme, themeValueRange } from '../../scripts/lib/theme-rename.ts'

const deck = (body: string) => `---\ntitle: Un deck\n${body}status: public\n---\n\n# Titre\n`

describe('themeValueRange', () => {
  it('locates the declared value', () => {
    const raw = deck('theme: dsfr\n')
    const range = themeValueRange(raw, 'dsfr')!
    expect(raw.slice(range.index, range.index + range.length)).toBe('dsfr')
  })

  it('reads a quoted value without its quotes', () => {
    const raw = deck('theme: "dsfr"\n')
    const range = themeValueRange(raw, 'dsfr')!
    expect(raw.slice(range.index, range.index + range.length)).toBe('dsfr')
  })

  it('answers nothing for another theme', () => {
    expect(themeValueRange(deck('theme: dsfr-standalone\n'), 'dsfr')).toBeNull()
    expect(themeValueRange(deck('theme: harbor\n'), 'dsfr')).toBeNull()
  })

  it('answers nothing when the deck declares no theme', () => {
    expect(themeValueRange(deck(''), 'dsfr')).toBeNull()
    expect(themeValueRange('# Titre\n', 'dsfr')).toBeNull()
  })

  // The body of a deck about themes names them too; only the frontmatter counts.
  it('ignores a declaration in the body', () => {
    expect(themeValueRange('# Titre\n\ntheme: dsfr\n', 'dsfr')).toBeNull()
  })
})

describe('renameTheme', () => {
  it('rewrites the value and leaves the rest of the deck alone', () => {
    expect(renameTheme(deck('theme: dsfr\n'), 'dsfr', 'meadow'))
      .toBe(deck('theme: meadow\n'))
  })

  it('keeps the quotes of a quoted value', () => {
    expect(renameTheme(deck('theme: "dsfr"\n'), 'dsfr', 'harbor'))
      .toBe(deck('theme: "harbor"\n'))
  })

  it('answers nothing for a deck to leave as it is', () => {
    expect(renameTheme(deck('theme: harbor\n'), 'dsfr', 'meadow')).toBeNull()
  })
})
