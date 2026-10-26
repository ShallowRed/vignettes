import {
  BACKGROUND_ANNOTATION_TAG,
  buildComponentMap,
  fullSlideComponentNames,
  normalizeIconName,
  registerDeckComponents,
  resetDeckComponents,
  STRIPPED_ANNOTATION_TAGS,
} from '@vignettes/core/deck'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => resetDeckComponents())

describe('annotation contract', () => {
  it('strips every annotation except the background one, read on its own pass', () => {
    expect(STRIPPED_ANNOTATION_TAGS).not.toContain(BACKGROUND_ANNOTATION_TAG)
    expect(STRIPPED_ANNOTATION_TAGS).toEqual(['pretitle', 'subtitle', 'layout', 'quicklink'])
  })
})

describe('buildComponentMap', () => {
  it('maps every canonical name to its component', () => {
    const map = buildComponentMap()
    expect(map.Quote).toBe('Quote')
    expect(map.IconInline).toBe('IconInline')
    expect(map.Columns).toBe('Columns')
  })

  it('resolves aliases to the same component as the canonical name', () => {
    const map = buildComponentMap()
    expect(map.i).toBe('IconInline')
    expect(map.TwoColumns).toBe('Columns')
    expect(map.ThreeColumns).toBe('Columns')
    expect(map.notes).toBe('Notes')
    expect(map.fragments).toBe('Fragments')
    expect(map['deck-image']).toBe('Image')
  })

  it('carries the column, with its lowercase form', () => {
    const map = buildComponentMap()
    expect(map.Column).toBe('Column')
    expect(map.column).toBe('Column')
  })

  it('leaves slide-background out: it is an annotation', () => {
    expect(buildComponentMap()['slide-background']).toBeUndefined()
  })
})

describe('registerDeckComponents', () => {
  it('adds a component and its aliases to the contract', () => {
    registerDeckComponents([{ name: 'Zone', component: 'JsonZone', aliases: ['zone'] }])
    const map = buildComponentMap()
    expect(map.Zone).toBe('JsonZone')
    expect(map.zone).toBe('JsonZone')
    expect(map.Quote).toBe('Quote')
  })

  it('declares a component that takes the whole slide', () => {
    expect(fullSlideComponentNames()).toEqual([])
    registerDeckComponents([{ name: 'Cover', aliases: ['cover'], fullSlide: true }])
    expect(fullSlideComponentNames()).toContain('Cover')
    expect(fullSlideComponentNames()).toContain('cover')
  })

  it('replaces the entry of a name registered twice', () => {
    registerDeckComponents([{ name: 'Quote', component: 'BrandQuote' }])
    expect(buildComponentMap().Quote).toBe('BrandQuote')
  })

  it('restores the shipped contract', () => {
    registerDeckComponents([{ name: 'Cover' }])
    resetDeckComponents()
    expect(buildComponentMap().Cover).toBeUndefined()
  })
})

describe('normalizeIconName', () => {
  it('passes through Iconify format unchanged', () => {
    expect(normalizeIconName('ri:home-line')).toBe('ri:home-line')
    expect(normalizeIconName('mdi:account')).toBe('mdi:account')
  })

  it('converts the Remix CSS-class form, first hyphen to colon', () => {
    expect(normalizeIconName('ri-home-line')).toBe('ri:home-line')
    expect(normalizeIconName('ri-arrow-right-line')).toBe('ri:arrow-right-line')
    expect(normalizeIconName('ri-a-b-c')).toBe('ri:a-b-c')
  })
})
