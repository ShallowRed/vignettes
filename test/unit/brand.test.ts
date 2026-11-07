import { deckBrand, showsBrand } from '@vignettes/core/render'
import { setThemeRegistry } from '@vignettes/core/theme'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => setThemeRegistry(null))

const ministere = {
  name: 'ministere',
  brand: { ministry: ['Ministère', 'de l\'Intérieur'], operator: '/themes/ministere/assets/operateur.svg', operatorAlt: 'Agence' },
}

describe('deckBrand', () => {
  it('draws nothing when neither the deck nor its theme sets a brand', () => {
    expect(deckBrand({ theme: 'dsfr' })).toBeUndefined()
  })

  it('titles the bloc marque République française on the title slide by default, in white on a dark background', () => {
    expect(deckBrand({ theme: 'dsfr', brand: {} })).toEqual({ lines: ['République', 'française'], slides: 'cover', onDark: 'white' })
  })

  it('takes the theme\'s keys and lets the deck override them one by one', () => {
    setThemeRegistry({ tokens: { ministere } })
    expect(deckBrand({ theme: 'ministere' })).toEqual({
      lines: ['Ministère', 'de l\'Intérieur'],
      operator: { src: '/themes/ministere/assets/operateur.svg', alt: 'Agence' },
      slides: 'cover',
      onDark: 'white',
    })
    expect(deckBrand({ theme: 'ministere', brand: { ministry: 'Ministère\ndes Armées', slides: 'all', onDark: 'color' } })).toMatchObject({
      lines: ['Ministère', 'des Armées'],
      operator: { alt: 'Agence' },
      slides: 'all',
      onDark: 'color',
    })
    expect(deckBrand({ theme: 'ministere', brand: false })).toBeUndefined()
  })
})

describe('showsBrand', () => {
  const cover = deckBrand({ brand: {} })
  const all = deckBrand({ brand: { slides: 'all' } })
  const slides = [{}, { headingLevel: 'h1' }, { headingLevel: 'h2' }]

  it('shows the bloc marque on the title slide, the first with a heading', () => {
    expect([0, 1, 2].map(index => showsBrand(cover, slides, index))).toEqual([false, true, false])
  })

  it('shows it on the first slide of the title slide\'s stack only', () => {
    expect(showsBrand(cover, slides, 1, 0)).toBe(true)
    expect(showsBrand(cover, slides, 1, 1)).toBe(false)
  })

  it('shows it on every slide with `slides: all`, and on none without a brand', () => {
    expect([0, 1, 2].map(index => showsBrand(all, slides, index, 1))).toEqual([true, true, true])
    expect(showsBrand(undefined, slides, 1)).toBe(false)
  })
})
