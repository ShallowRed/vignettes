import { LAYOUT_ATTRIBUTES, legacyComponentLayout, readLayout } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

describe('readLayout', () => {
  it('places a media with its defaults', () => {
    expect(readLayout({ media: 'right', src: '/a.png' })).toEqual({
      layout: { media: { placement: 'right', size: '1/2', src: '/a.png', fit: 'cover', position: 'center', alt: '', lightbox: false, viewport: 1440 } },
      issues: [],
    })
  })

  it('places a source without media on the right', () => {
    expect(readLayout({ story: 'page--home' }).layout.media).toMatchObject({ placement: 'right', story: 'page--home' })
  })

  it('leaves the size of a media at the top or the bottom to the text, unless given', () => {
    expect(readLayout({ media: 'bottom', src: '/a.png' }).layout.media?.size).toBeUndefined()
    expect(readLayout({ media: 'top', src: '/a.png', size: '2/3' }).layout.media?.size).toBe('2/3')
  })

  it('reads the settings of a media', () => {
    const { layout, issues } = readLayout({ media: 'left', size: '3/4', src: '/page', type: 'iframe', fit: 'contain', position: 'top', alt: 'The page', lightbox: true, hint: 'Open', viewport: '1600' })
    expect(issues).toEqual([])
    expect(layout.media).toEqual({ placement: 'left', size: '3/4', src: '/page', type: 'iframe', fit: 'contain', position: 'top', alt: 'The page', lightbox: true, hint: 'Open', viewport: 1600 })
  })

  it('reads a veil behind the text as a share of black', () => {
    expect(readLayout({ media: 'behind', src: '/a.jpg', veil: '40%' }).layout.media).toMatchObject({ placement: 'behind', veil: 0.4 })
    expect(readLayout({ media: 'behind', src: '/a.jpg' }).layout.media).not.toHaveProperty('veil')
    expect(readLayout({ media: 'behind', src: '/a.jpg' }).layout.media).not.toHaveProperty('size')
  })

  it('reads the heading mode with or without a media', () => {
    expect(readLayout({ heading: 'compact' })).toEqual({ layout: { heading: 'compact' }, issues: [] })
  })

  it('reads the vertical alignment with or without a media', () => {
    expect(readLayout({ align: 'top' })).toEqual({ layout: { align: 'top' }, issues: [] })
    expect(readLayout({ media: 'left', src: '/a.png', align: 'bottom' }).layout).toMatchObject({ align: 'bottom', media: { placement: 'left' } })
    expect(readLayout({ align: 'middle' }).issues).toEqual([{ kind: 'invalid-value', attribute: 'align' }])
  })

  it('names the attributes it leaves out', () => {
    expect(readLayout({ media: 'middle', src: '/a.png', colour: 'red' }).issues).toEqual([
      { kind: 'invalid-value', attribute: 'media' },
      { kind: 'unknown-attribute', attribute: 'colour' },
    ])
    expect(readLayout({ media: 'right', src: '/a.png', size: '60%' }).issues).toEqual([{ kind: 'invalid-value', attribute: 'size' }])
    expect(readLayout({ media: 'behind', src: '/a.png', veil: '140%' }).issues).toEqual([{ kind: 'invalid-value', attribute: 'veil' }])
  })

  it('gives no media pane without a source', () => {
    expect(readLayout({ media: 'right' })).toEqual({ layout: {}, issues: [{ kind: 'missing-source', attribute: 'src' }] })
  })

  it('keeps a story or a page from going behind the text', () => {
    expect(readLayout({ media: 'behind', story: 'a--b' })).toEqual({ layout: {}, issues: [{ kind: 'behind-needs-image', attribute: 'story' }] })
    expect(readLayout({ media: 'behind', src: 'https://example.com', type: 'iframe' }).issues).toEqual([{ kind: 'behind-needs-image', attribute: 'type' }])
    expect(readLayout({ media: 'behind', src: 'https://picsum.photos/1920/1080' }).layout.media).toMatchObject({ placement: 'behind' })
  })

  it('names a setting the placement does not use', () => {
    expect(readLayout({ media: 'right', src: '/a.png', veil: '40%' }).issues).toEqual([{ kind: 'unused', attribute: 'veil' }])
    expect(readLayout({ media: 'behind', src: '/a.png', size: '1/2' }).issues).toEqual([{ kind: 'unused', attribute: 'size' }])
  })

  it('reads the names of the earlier format', () => {
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      [{ name: 'media-right', src: '/a.png' }, { placement: 'right', size: '1/2' }],
      [{ name: 'media-left-wide', src: '/a.png' }, { placement: 'left', size: '2/3' }],
      [{ name: 'media-right-xwide', story: 'a--b', previewWidth: '1600' }, { placement: 'right', size: '3/4', viewport: 1600 }],
      [{ 'name': 'media-below', 'src': '/a.png', 'preview-width': '1280' }, { placement: 'bottom', viewport: 1280 }],
      [{ name: 'media-above', src: '/a.png' }, { placement: 'top' }],
      [{ name: 'media-cover', src: '/a.png' }, { placement: 'behind' }],
      [{ name: 'media-right', src: '/page', title: 'The page' }, { alt: 'The page' }],
    ]
    for (const [attributes, media] of cases) {
      const { layout, issues } = readLayout(attributes)
      expect(layout.media).toMatchObject(media)
      expect(issues.every(issue => issue.kind === 'legacy')).toBe(true)
    }
    expect(readLayout({ name: 'media-cover', story: 'a--b' }).layout.media).toMatchObject({ placement: 'top', story: 'a--b' })
    expect(readLayout({ name: 'media-cover', src: 'https://example.com' }).layout.media).toMatchObject({ placement: 'top' })
    expect(readLayout({ name: 'grid-compact' }).layout).toEqual({ heading: 'compact' })
    expect(readLayout({ name: 'full' }).layout).toEqual({})
  })

  it('reports a name the earlier format never had', () => {
    expect(readLayout({ name: 'media-rigth', src: '/a.png' }).issues).toEqual([{ kind: 'unknown-attribute', attribute: 'name' }])
  })
})

describe('legacyComponentLayout', () => {
  it('lays a full-screen image behind the text', () => {
    expect(legacyComponentLayout('FullScreenImage', { src: '/a.jpg', overlay: '0.4', heading: 'hidden' }))
      .toEqual({ media: 'behind', src: '/a.jpg', type: 'image', veil: '40%', heading: 'hidden' })
    expect(legacyComponentLayout('full-screen-image', { src: '/a.jpg' })).toEqual({ media: 'behind', src: '/a.jpg', type: 'image' })
  })

  it('places a split slide on its side with its share', () => {
    expect(legacyComponentLayout('SplitSlide', { src: '/a.png', type: 'image', ratio: '1:1', reverse: true }))
      .toEqual({ media: 'left', size: '1/2', src: '/a.png', type: 'image' })
    expect(legacyComponentLayout('split-slide', { src: '/page' })).toEqual({ media: 'right', size: '2/3', src: '/page', type: 'iframe' })
  })

  it('leaves the other components', () => {
    expect(legacyComponentLayout('Image', { src: '/a.png' })).toBeUndefined()
  })
})

describe('layout attributes', () => {
  it('describes each attribute in French and in English', () => {
    for (const attribute of LAYOUT_ATTRIBUTES)
      expect(Object.keys(attribute.description).sort()).toEqual(['en', 'fr'])
  })
})
