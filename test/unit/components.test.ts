import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_ANNOTATION_TAG,
  buildComponentMap,
  normalizeIconName,
  STRIPPED_ANNOTATION_TAGS,
} from '../../shared/deck/components'

describe('annotation contract', () => {
  it('strips every annotation except the background one (handled separately)', () => {
    expect(STRIPPED_ANNOTATION_TAGS).not.toContain(BACKGROUND_ANNOTATION_TAG)
    expect(STRIPPED_ANNOTATION_TAGS).toEqual(['pretitle', 'subtitle', 'layout', 'quicklink'])
  })
})

describe('buildComponentMap', () => {
  const map = buildComponentMap()

  it('maps every canonical name to its component', () => {
    expect(map.Quote).toBe('Quote')
    expect(map.IconInline).toBe('IconInline')
    expect(map.Columns).toBe('Columns')
  })

  it('resolves aliases to the same component as the canonical name', () => {
    expect(map.i).toBe('IconInline')
    expect(map.TwoColumns).toBe('Columns')
    expect(map.ThreeColumns).toBe('Columns')
    expect(map['full-screen-image']).toBe('FullScreenImage')
  })

  it('registers the progressive-disclosure components under their lowercase aliases', () => {
    expect(map.notes).toBe('Notes')
    expect(map.fragments).toBe('Fragments')
    expect(map.scheme).toBe('Scheme')
    expect(map.step).toBe('Step')
    expect(map.Node).toBe('DiagramNode')
    expect(map.edge).toBe('DiagramEdge')
  })

  it('does not register slide-background (it is an annotation, not a component)', () => {
    expect(map['slide-background']).toBeUndefined()
  })
})

describe('normalizeIconName', () => {
  it('passes through Iconify format unchanged', () => {
    expect(normalizeIconName('ri:home-line')).toBe('ri:home-line')
    expect(normalizeIconName('mdi:account')).toBe('mdi:account')
  })

  it('converts the Remix CSS-class form (first hyphen → colon)', () => {
    expect(normalizeIconName('ri-home-line')).toBe('ri:home-line')
    expect(normalizeIconName('ri-arrow-right-line')).toBe('ri:arrow-right-line')
  })

  it('only converts the first hyphen', () => {
    expect(normalizeIconName('ri-a-b-c')).toBe('ri:a-b-c')
  })
})
