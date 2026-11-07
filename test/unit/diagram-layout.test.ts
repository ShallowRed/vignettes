import { describe, expect, it } from 'vitest'
import { rankedLayout } from '../../packages/schemas/src/runtime/diagram-layout.ts'

describe('rankedLayout', () => {
  it('places every card, a card without a name included, and ranks the arrows between named cards', () => {
    const card = { width: 100, height: 40 }
    const layout = rankedLayout(
      [{ ...card, id: '' }, { ...card, id: 'a' }, { ...card, id: 'b' }, { ...card }, { ...card, id: 'a' }],
      [{ from: 'a', to: 'b' }, { from: '', to: 'a' }, { from: 'a', to: 'zz' }],
      'LR',
    )
    expect(layout.corners).toHaveLength(5)
    expect(layout.corners[1]!.left).toBeLessThan(layout.corners[2]!.left)
    expect(layout.width).toBeGreaterThan(0)
  })
})
