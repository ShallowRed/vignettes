import { describe, expect, it } from 'vitest'
import { sharedFitScale } from '../../packages/nuxt/src/runtime/utils/diagram-fit.ts'

describe('sharedFitScale', () => {
  it('keeps a diagram that fits at its drawn size', () => {
    expect(sharedFitScale([{ width: 800, height: 300, availableWidth: 1152, availableHeight: 470 }])).toBe(1)
  })

  it('shrinks a diagram to the tighter of its width and its height', () => {
    expect(sharedFitScale([{ width: 1548, height: 560, availableWidth: 1152, availableHeight: 470 }])).toBeCloseTo(1152 / 1548)
    expect(sharedFitScale([{ width: 1050, height: 647, availableWidth: 1152, availableHeight: 470 }])).toBeCloseTo(470 / 647)
  })

  it('gives the diagrams of one slide the scale of the tightest', () => {
    const rooms = [
      { width: 410, height: 233, availableWidth: 352, availableHeight: 400 },
      { width: 510, height: 250, availableWidth: 352, availableHeight: 400 },
    ]
    expect(sharedFitScale(rooms)).toBeCloseTo(352 / 510)
  })

  it('bounds the width alone when the rest of the slide leaves no height', () => {
    expect(sharedFitScale([{ width: 1300, height: 400, availableWidth: 1152, availableHeight: -20 }])).toBeCloseTo(1152 / 1300)
  })

  it('ignores a diagram in a container without width', () => {
    const rooms = [
      { width: 400, height: 200, availableWidth: 0, availableHeight: 470 },
      { width: 800, height: 300, availableWidth: 1152, availableHeight: 470 },
    ]
    expect(sharedFitScale(rooms)).toBe(1)
  })

  it('skips a diagram not drawn yet', () => {
    expect(sharedFitScale([{ width: 0, height: 0, availableWidth: 1152, availableHeight: 470 }])).toBe(1)
  })
})
