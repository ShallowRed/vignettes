import { describe, expect, it } from 'vitest'
import { parseDeckMeta } from '../../shared/deck/schema'

describe('parseDeckMeta', () => {
  it('coerces numeric reveal options coming from strings', () => {
    const { meta, valid } = parseDeckMeta({ reveal: { margin: '0.2', width: '1200' } })
    expect(valid).toBe(true)
    expect(meta.reveal).toMatchObject({ margin: 0.2, width: 1200 })
  })

  it('passes unknown keys through', () => {
    const { meta } = parseDeckMeta({ theme: 'brand', custom: 'x' })
    expect((meta as any).custom).toBe('x')
  })

  it('flags a parser typo but is non-destructive by default', () => {
    const { valid, issues, meta } = parseDeckMeta({ parser: 'lea' })
    expect(valid).toBe(false)
    expect(issues.join()).toContain('parser')
    expect((meta as any).parser).toBe('lea')
  })

  it('throws in strict mode on invalid frontmatter', () => {
    expect(() => parseDeckMeta({ parser: 'lea' }, { strict: true })).toThrow(/parser/)
  })
})
