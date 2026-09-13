import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PALETTE_NAMES, paletteVars } from '@vignettes/schemas/runtime/palette.ts'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../../packages/schemas/src/runtime/palette.css', import.meta.url)), 'utf8')

describe('card palette', () => {
  it('defines the three properties of every name it accepts', () => {
    for (const name of PALETTE_NAMES) {
      for (const part of ['bg', 'main', 'text'])
        expect(css, `${name}-${part}`).toContain(`--palette-${name}-${part}:`)
    }
  })

  it('points a card at the named tint', () => {
    expect(paletteVars('blue-france')).toEqual({
      '--tone-bg': 'var(--palette-blue-france-bg)',
      '--tone-main': 'var(--palette-blue-france-main)',
      '--tone-text': 'var(--palette-blue-france-text)',
    })
  })

  it('leaves the card to its own colours when the name is unknown', () => {
    expect(paletteVars('not-a-tint')).toBeUndefined()
    expect(paletteVars()).toBeUndefined()
  })
})
