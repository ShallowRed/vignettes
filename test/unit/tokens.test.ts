import { describe, expect, it } from 'vitest'
import { KNOWN_THEMES, THEME_BACKGROUNDS, THEME_TOKENS } from '../../shared/theme/tokens'

describe('theme tokens manifest', () => {
  it('derives THEME_BACKGROUNDS from the manifest', () => {
    expect(THEME_BACKGROUNDS.brand).toEqual(THEME_TOKENS.brand!.backgrounds)
    expect(THEME_BACKGROUNDS.minimal).toEqual({})
  })

  it('exposes KNOWN_THEMES from the manifest', () => {
    expect(KNOWN_THEMES).toEqual(Object.keys(THEME_TOKENS))
  })
})
