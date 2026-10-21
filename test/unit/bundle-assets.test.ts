import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReducedPublic, copyDeckAssets, referencedDeckAssets } from '@vignettes/freeze'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('referencedDeckAssets', () => {
  it('collects the deck asset URLs of a document, deduplicated', () => {
    const markdown = [
      '::Image{src="/images/atlas/carte.svg"}',
      ':slide-background{image="/backgrounds/title.png"}',
      '::Step{picto="custom/regle"}',
      '![](/pictograms/custom/regle.svg)',
      '::Image{src="/images/atlas/carte.svg"}',
      '![](https://example.com/remote.png)',
      '![](/media/abc123.png)',
    ].join('\n')
    expect(referencedDeckAssets(markdown)).toEqual([
      '/images/atlas/carte.svg',
      '/backgrounds/title.png',
      '/pictograms/custom/regle.svg',
    ])
  })

  it('finds nothing in a document without deck assets', () => {
    expect(referencedDeckAssets('# Title\n\nSome text.')).toEqual([])
  })
})

describe('bundle asset copying', () => {
  let root: string
  let out: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'bundle-'))
    out = join(root, 'out')
    mkdirSync(join(root, 'public/themes'), { recursive: true })
    mkdirSync(join(root, 'public/pictograms/digital'), { recursive: true })
    mkdirSync(join(root, 'public/themes/brand/assets'), { recursive: true })
    mkdirSync(join(root, 'public/themes/other/assets'), { recursive: true })
    writeFileSync(join(root, 'public/themes/brand.css'), 'brand')
    writeFileSync(join(root, 'public/themes/other.css'), 'other')
    writeFileSync(join(root, 'public/themes/brand/assets/bg.png'), 'x')
    writeFileSync(join(root, 'public/themes/other/assets/bg.png'), 'x')
    writeFileSync(join(root, 'public/pictograms/digital/coding.svg'), 'svg')
    writeFileSync(join(root, 'public/favicon.svg'), 'svg')
    mkdirSync(join(root, 'presentations/assets/images/atlas'), { recursive: true })
    writeFileSync(join(root, 'presentations/assets/images/atlas/carte.svg'), 'svg')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('keeps only the frozen deck theme in the reduced public dir', () => {
    const kept = buildReducedPublic(root, out, 'brand')
    expect(kept).toContain('favicon.svg')
    expect(kept).toContain('pictograms')
    expect(readdirSync(join(out, 'themes')).sort()).toEqual(['brand', 'brand.css'])
    expect(existsSync(join(out, 'themes/brand/assets/bg.png'))).toBe(true)
  })

  it('copies a referenced content-space asset into the bundle at its own path', () => {
    const result = copyDeckAssets(root, '::Image{src="/images/atlas/carte.svg"}', out)
    expect(result).toEqual({ copied: ['/images/atlas/carte.svg'], missing: [] })
    expect(existsSync(join(out, 'images/atlas/carte.svg'))).toBe(true)
  })

  it('leaves an asset the application already ships in place', () => {
    const result = copyDeckAssets(root, '![](/pictograms/digital/coding.svg)', out)
    expect(result.copied).toEqual(['/pictograms/digital/coding.svg'])
    expect(result.missing).toEqual([])
  })

  it('reports an asset path out of the content space as missing, and copies nothing', () => {
    const result = copyDeckAssets(root, '![](/images/../../.data/slides.db)', out)
    expect(result).toEqual({ copied: [], missing: ['/images/../../.data/slides.db'] })
  })

  it('reports a missing asset instead of failing the freeze', () => {
    expect(copyDeckAssets(root, '![](/images/gone.png)', out).missing).toEqual(['/images/gone.png'])
  })
})

describe('buildReducedPublic', () => {
  it('refuses a theme whose stylesheet has not been compiled', () => {
    const root = mkdtempSync(join(tmpdir(), 'freeze-root-'))
    mkdirSync(join(root, 'public', 'themes'), { recursive: true })
    const out = mkdtempSync(join(tmpdir(), 'freeze-out-'))
    expect(() => buildReducedPublic(root, out, 'brand')).toThrow(/no compiled stylesheet/)
  })
})
