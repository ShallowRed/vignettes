import { deckRevealOptions, parseDeckMeta, readDeckFile } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

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

  it('flags a typo in `syntax.split`', () => {
    const { valid, issues } = parseDeckMeta({ syntax: { split: 'titres' } })
    expect(valid).toBe(false)
    expect(issues.join()).toContain('syntax.split')
  })

  it('accepts `brand: false` or the brand keys, and flags another set of slides or another version', () => {
    expect(parseDeckMeta({ brand: false }).valid).toBe(true)
    expect(parseDeckMeta({ brand: { ministry: ['Ministère', 'des Armées'], slides: 'all', onDark: 'color' } }).valid).toBe(true)
    expect(parseDeckMeta({ brand: { slides: 'first' } }).issues.join()).toContain('brand.slides')
    expect(parseDeckMeta({ brand: { onDark: 'plate' } }).issues.join()).toContain('brand.onDark')
  })

  it('throws in strict mode on invalid frontmatter', () => {
    expect(() => parseDeckMeta({ parser: 'lea' }, { strict: true })).toThrow(/parser/)
  })
})

describe('readDeckFile', () => {
  it('returns the metadata of a file that gives its title', () => {
    expect(readDeckFile('---\ntitle: Bilan\ntheme: dsfr\n---\n\n# Bilan\n')).toMatchObject({ valid: true, meta: { title: 'Bilan', theme: 'dsfr' } })
  })

  it('names the key and the nature of each refused value, the title included', () => {
    expect(readDeckFile('---\nparser: titres\n---\n')).toMatchObject({ valid: false, issues: [{ key: 'title', reason: 'no-title' }, { key: 'parser', reason: 'value', values: ['separator', 'heading'] }] })
    expect(readDeckFile('---\ntitle: " "\n---\n')).toMatchObject({ valid: false, issues: [{ key: 'title', reason: 'no-title' }] })
    expect(readDeckFile('---\ntitle: 42\n---\n')).toMatchObject({ valid: false, issues: [{ key: 'title', reason: 'value', expected: 'string' }] })
  })

  it('gives the type or the values a refused value takes, when the schema gives them', () => {
    const raw = '---\ntitle: A\nstorybook: "javascript:x"\nreveal:\n  width: large\nbrand:\n  slides: some\ncode: [1]\n---\n'
    expect(readDeckFile(raw)).toEqual({
      valid: false,
      issues: [
        { key: 'storybook', reason: 'address', message: expect.any(String) },
        { key: 'brand.slides', reason: 'value', message: expect.any(String), values: ['cover', 'all'] },
        { key: 'reveal.width', reason: 'value', message: expect.any(String), expected: 'number' },
        { key: 'code', reason: 'value', message: expect.any(String) },
      ],
    })
  })

  it('reports a block that is not YAML without a key', () => {
    expect(readDeckFile('---\ntitle: [Bilan\n---\n')).toMatchObject({ valid: false, issues: [{ key: '', reason: 'unreadable' }] })
  })

  it('reports a front matter whose closing line is missing, by the heading it takes in', () => {
    expect(readDeckFile('---\ntitle: Bilan\n\n# Bilan\n\n---\n## Suite\n')).toMatchObject({ valid: false, issues: [{ key: '', reason: 'unclosed', message: expect.stringMatching(/^Line 4:/) }] })
  })
})

describe('deckRevealOptions', () => {
  it('keeps the options the schema names and leaves out the others', () => {
    expect(deckRevealOptions({ width: 1200, dependencies: [{ src: 'data:text/javascript,alert(1)' }] })).toEqual({ width: 1200 })
    expect(deckRevealOptions(undefined)).toEqual({})
  })
})
