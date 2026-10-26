import type { Slide } from '@vignettes/core/deck'
import { inferMediaType, readLayout } from '@vignettes/core/deck'
import {
  behindMedia,
  buildDeckModel,
  collectAssets,
  resolveSlideBackground,
  resolveSlideMedia,
  runTransforms,
} from '@vignettes/core/render'
import { setThemeRegistry } from '@vignettes/core/theme'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A tenant theme with backgrounds, registered the way the server does at runtime.
beforeAll(() => setThemeRegistry({
  tokens: {
    brand: {
      name: 'brand',
      backgrounds: { h1: '/themes/brand/assets/slide-contrast.png', h2: '/themes/brand/assets/slide-contrast.png', h3: '/themes/brand/assets/slide-subtle.png' },
    },
  },
}))
afterAll(() => setThemeRegistry(null))

const media = (attributes: Record<string, unknown>) => readLayout(attributes).layout.media

describe('resolveSlideMedia (extracted from SlideContent.mediaParts)', () => {
  it('returns null without a media or behind the text', () => {
    expect(resolveSlideMedia(undefined)).toBeNull()
    expect(resolveSlideMedia(media({ alt: 'x' }))).toBeNull()
    expect(resolveSlideMedia(media({ media: 'behind', src: '/images/x.png' }))).toBeNull()
  })

  it('resolves a story id to a scaled, interactive iframe', () => {
    const frame = resolveSlideMedia(media({ story: 'comp--page' }), { storybook: 'https://sb.example' })!
    expect(frame.type).toBe('iframe')
    expect(frame.src).toBe('https://sb.example/iframe.html?id=comp--page&viewMode=story')
    expect(frame.scaled).toBe(true)
    expect(frame.interactive).toBe(true) // no lightbox → interactive in place
    expect(frame.viewport).toBe(1440)
  })

  it('honors the viewport and disables scaling on fit=contain', () => {
    const frame = resolveSlideMedia(media({ story: 'c--p', viewport: '1600', fit: 'contain' }), { storybook: 'https://sb' })!
    expect(frame.fit).toBe('contain')
    expect(frame.scaled).toBe(false)
    expect(frame.viewport).toBe(1600)
  })

  it('falls back to an explicit image src/type', () => {
    const image = resolveSlideMedia(media({ src: '/images/x.png', type: 'image' }))!
    expect(image.type).toBe('image')
    expect(image.scaled).toBe(false)
  })

  it('exposes lightbox preview link/image', () => {
    const frame = resolveSlideMedia(media({ story: 'c--p', lightbox: true }), { storybook: 'https://sb' })!
    expect(frame.hasLightbox).toBe(true)
    expect(frame.interactive).toBe(false)
    expect(frame.previewLink).toBe(frame.src)
    const img = resolveSlideMedia(media({ src: '/images/y.png', type: 'image', lightbox: 'true' }))!
    expect(img.previewImage).toBe('/images/y.png')
  })

  it('shows a page as a frame and an image file as an image when no type is given', () => {
    expect(resolveSlideMedia(media({ src: '/slides/demo' }))!.type).toBe('iframe')
    expect(resolveSlideMedia(media({ src: '/images/x.svg?v=2' }))!.type).toBe('image')
    expect(inferMediaType('/images/x.png', 'iframe')).toBe('iframe')
  })
})

describe('resolveSlideBackground (precedence preserved)', () => {
  it('slide override wins over the theme', () => {
    expect(resolveSlideBackground({ backgroundImage: '/o.png', headingLevel: 'h1' }, 'brand')).toBe('/o.png')
  })

  it('a media behind the text wins over the slide override', () => {
    const layout = readLayout({ media: 'behind', src: '/images/behind.png', veil: '40%' }).layout
    expect(resolveSlideBackground({ backgroundImage: '/o.png', headingLevel: 'h3', layout }, 'brand')).toBe('/images/behind.png')
    expect(behindMedia({ layout })?.veil).toBe(0.4)
  })

  it('frontmatter custom backgrounds win over theme tokens', () => {
    const r = resolveSlideBackground({ headingLevel: 'h1' }, 'brand', { h1: '/custom.png' })
    expect(r).toBe('/custom.png')
  })

  it('falls back to theme tokens by heading level', () => {
    expect(resolveSlideBackground({ headingLevel: 'h1' }, 'brand')).toBe('/themes/brand/assets/slide-contrast.png')
  })

  it('gives the section background to a section and the content background to another ## slide', () => {
    expect(resolveSlideBackground({ headingLevel: 'h2', section: true }, 'brand')).toBe('/themes/brand/assets/slide-contrast.png')
    expect(resolveSlideBackground({ headingLevel: 'h2' }, 'brand')).toBe('/themes/brand/assets/slide-subtle.png')
  })

  it('returns undefined for a theme with no backgrounds', () => {
    expect(resolveSlideBackground({ headingLevel: 'h1' }, 'minimal')).toBeUndefined()
  })
})

describe('collectAssets + pipeline', () => {
  const slides: Slide[] = [
    { body: {}, headingLevel: 'h1', layout: readLayout({ story: 'c--p' }).layout },
    {
      body: {},
      headingLevel: 'h2',
      verticalSlides: [
        { body: {}, layout: readLayout({ media: 'left', src: '/images/z.png', type: 'image' }).layout },
      ],
    },
  ]

  it('collects storybook, image, and background assets (deduped)', () => {
    const assets = collectAssets(slides, { storybook: 'https://sb', theme: 'brand' })
    const kinds = assets.map(a => a.kind)
    expect(kinds).toContain('storybook')
    expect(kinds).toContain('image')
    expect(assets.some(a => a.url === '/themes/brand/assets/slide-contrast.png')).toBe(true)
  })

  it('buildDeckModel runs the default pipeline and fills assets', () => {
    const model = buildDeckModel({ theme: 'brand', storybook: 'https://sb' }, slides, { parser: 'separator', source: 'codimd' })
    expect(model.assets.length).toBeGreaterThan(0)
    expect(model.provenance).toEqual({ parser: 'separator', source: 'codimd' })
  })

  it('runTransforms applies named steps in order', () => {
    const tagged = runTransforms(
      { meta: {}, slides: [], assets: [] },
      [{ name: 'mark', apply: m => ({ ...m, meta: { ...m.meta, title: 'done' } }) }],
    )
    expect(tagged.meta.title).toBe('done')
  })
})
