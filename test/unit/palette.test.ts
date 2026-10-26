import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { paletteVars } from '@vignettes/schemas/runtime/palette.ts'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')
const kit = read('packages/theme-kit/_palette.scss')
const dsfr = read('packages/theme-dsfr/_palette.scss')
const kitNames = [...new Set([...kit.matchAll(/--palette-([a-z-]+)-bg:/g)].map(m => m[1]))]

describe('card palette', () => {
  it('gives each name of the theme kit its three properties, in the kit and in the DSFR theme', () => {
    expect(kitNames.length).toBeGreaterThan(0)
    for (const name of kitNames) {
      for (const part of ['main', 'text'])
        expect(kit, `${name}-${part}`).toContain(`--palette-${name}-${part}:`)
      for (const part of ['bg', 'main', 'text'])
        expect(dsfr, `${name}-${part}`).toContain(`--palette-${name}-${part}:`)
    }
  })

  it('points a card at the named tint, or at the accent when the theme leaves the name undefined', () => {
    expect(paletteVars('green')).toEqual({
      '--tone-bg': 'var(--palette-green-bg, var(--accent-bg))',
      '--tone-main': 'var(--palette-green-main, var(--accent))',
      '--tone-text': 'var(--palette-green-text, var(--accent-strong))',
    })
  })

  it('mixes the tint of a CSS colour', () => {
    expect(paletteVars('#2a7f62')).toEqual({
      '--tone-bg': 'color-mix(in oklab, #2a7f62 12%, var(--surface))',
      '--tone-main': '#2a7f62',
      '--tone-text': 'color-mix(in oklab, #2a7f62 55%, var(--text-title))',
    })
    expect(paletteVars('oklch(60% 0.15 150)')?.['--tone-main']).toBe('oklch(60% 0.15 150)')
    expect(paletteVars('hsl(200deg 50% 40%)')?.['--tone-main']).toBe('hsl(200deg 50% 40%)')
  })

  it('leaves the card to its own colours for any other value', () => {
    expect(paletteVars('red; background: url(x)')).toBeUndefined()
    expect(paletteVars('Green')).toBeUndefined()
    expect(paletteVars()).toBeUndefined()
  })
})
