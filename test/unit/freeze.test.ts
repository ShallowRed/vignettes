import { buildFreezeDescriptor, DEFAULT_FROZEN_HOST_DIR } from '@vignettes/freeze/descriptor'
import { describe, expect, it } from 'vitest'

describe('buildFreezeDescriptor', () => {
  it('derives every value from a minimal entry', () => {
    const d = buildFreezeDescriptor({ alias: 'conference-talk' })
    expect(d).toEqual({
      alias: 'conference-talk',
      slug: 'conference-talk',
      bundle: 'conference-talk',
      theme: undefined,
      baseUrl: '/frozen/conference-talk/',
      hostDir: `${DEFAULT_FROZEN_HOST_DIR}/conference-talk`,
      deckDir: 'conference-talk--standalone',
      servedUrl: '/frozen/conference-talk/slides/conference-talk--standalone/',
      embedsStorybook: false,
      steps: [
        { id: 'build-bundle', description: expect.any(String), enabled: true },
        { id: 'embed-storybook', description: expect.any(String), enabled: false },
        { id: 'host-bundle', description: expect.any(String), enabled: true },
        { id: 'upload-bundle', description: expect.any(String), enabled: true },
        { id: 'flip-lifecycle', description: expect.any(String), enabled: true },
      ],
    })
  })

  it('serves the deck under its own slug inside the alias bundle', () => {
    const d = buildFreezeDescriptor({ alias: 'annual-review', slug: 'annual-review-2026' })
    expect(d.slug).toBe('annual-review-2026')
    expect(d.baseUrl).toBe('/frozen/annual-review/')
    expect(d.servedUrl).toBe('/frozen/annual-review/slides/annual-review-2026--standalone/')
  })

  it('hosts under frozenBundle when it differs from the alias', () => {
    const d = buildFreezeDescriptor({ alias: 'talk', frozenBundle: 'talk-v2' })
    expect(d.bundle).toBe('talk-v2')
    expect(d.baseUrl).toBe('/frozen/talk-v2/')
    expect(d.hostDir).toBe(`${DEFAULT_FROZEN_HOST_DIR}/talk-v2`)
  })

  it('enables the storybook pass only when a built storybook is given', () => {
    const without = buildFreezeDescriptor({ alias: 'deck' })
    expect(without.steps.find(s => s.id === 'embed-storybook')?.enabled).toBe(false)
    const with_ = buildFreezeDescriptor({ alias: 'deck' }, { storybookDir: '/tmp/sb' })
    expect(with_.embedsStorybook).toBe(true)
    expect(with_.steps.find(s => s.id === 'embed-storybook')?.enabled).toBe(true)
  })

  it('carries the deck theme and an alternate host dir', () => {
    const d = buildFreezeDescriptor({ alias: 'deck' }, { theme: 'dsfr', frozenHostDir: '.archive' })
    expect(d.theme).toBe('dsfr')
    expect(d.hostDir).toBe('.archive/deck')
    expect(d.steps[0].description).toContain('dsfr')
  })

  it('is pure — does not mutate the input entry or options', () => {
    const entry = { alias: 'deck' }
    const options = {}
    buildFreezeDescriptor(entry, options)
    expect(entry).toEqual({ alias: 'deck' })
    expect(options).toEqual({})
  })
})
