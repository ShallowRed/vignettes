import { LAYOUT_ATTRIBUTES, layoutAnnotationChange, layoutAnnotations, layoutDefault, layoutForPlacement, layoutMentions, layoutSource, legacyComponentLayout, readLayout } from '@vignettes/core/deck'
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

  it('reads a screen slide, and leaves it out beside a media pane', () => {
    expect(readLayout({ screen: true })).toEqual({ layout: { screen: true, heading: 'compact' }, issues: [] })
    expect(readLayout({ screen: '', heading: 'hidden' }).layout).toEqual({ screen: true, heading: 'hidden' })
    expect(readLayout({ media: 'right', src: '/a.png', screen: true })).toMatchObject({ layout: { media: { placement: 'right' } }, issues: [{ kind: 'unused', attribute: 'screen' }] })
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

describe('layoutSource', () => {
  it('writes the attributes of the earlier writing in their current form, in the order of the reference', () => {
    expect(layoutSource({ lightbox: 'true', story: 'a--b', name: 'media-right-xwide', previewWidth: '1600' }))
      .toBe(':layout{media="right" size="3/4" story="a--b" lightbox viewport="1600"}')
  })

  it('keeps a value that holds a double quote, and writes nothing without attributes', () => {
    expect(layoutSource({ media: 'right', src: '/a.png', alt: 'Le "parcours"' })).toBe(':layout{media="right" src="/a.png" alt=\'Le "parcours"\'}')
    expect(layoutSource({ lightbox: false })).toBe('')
  })

  it('writes a value that holds both quotes with an entity, which the annotation reads back', () => {
    const source = layoutSource({ media: 'right', src: '/a.png', alt: 'L\'outil "X"' })
    expect(source).toBe(':layout{media="right" src="/a.png" alt="L\'outil &quot;X&quot;"}')
    expect(layoutAnnotations(source)[0]!.attributes.find(attribute => attribute.name === 'alt')!.value).toBe('L\'outil "X"')
  })
})

describe('layoutDefault', () => {
  it('keeps the heading of a screen slide to one line', () => {
    expect(layoutDefault('heading')).toBeUndefined()
    expect(layoutDefault('heading', { screen: true })).toBe('compact')
    expect(layoutDefault('fit', { screen: true })).toBe('cover')
  })
})

describe('layoutForPlacement', () => {
  it('keeps the settings the new placement uses', () => {
    expect(layoutForPlacement({ media: 'right', size: '2/3', src: '/a.png', align: 'top' }, 'left')).toEqual({ media: 'left', size: '2/3', src: '/a.png', align: 'top' })
  })

  it('drops a story, a page and the pane settings behind the text, and the veil elsewhere', () => {
    expect(layoutForPlacement({ media: 'right', story: 'a--b', src: '/a.png', type: 'iframe', size: '3/4', viewport: '1600', lightbox: true }, 'behind')).toEqual({ media: 'behind', src: '/a.png' })
    expect(layoutForPlacement({ media: 'behind', src: '/a.png', veil: '40%' }, 'top')).toEqual({ media: 'top', src: '/a.png' })
  })

  it('drops the screen slide for a media pane', () => {
    expect(layoutForPlacement({ screen: true }, 'right')).toEqual({ media: 'right' })
  })

  it('keeps the heading and the alignment without a media, in the current form', () => {
    expect(layoutForPlacement({ name: 'grid-compact', src: '/a.png', align: 'top' }, 'none')).toEqual({ heading: 'compact', align: 'top' })
  })
})

describe('layoutMentions', () => {
  it('places each issue on its attribute, outside code', () => {
    const raw = '## Un\n\n:layout{media="middle" src="/a.png" lightbox}\n\n`:layout{colour="red"}`\n'
    expect(layoutMentions(raw)).toEqual([{ kind: 'invalid-value', attribute: 'media', line: 3, column: 8, length: 14 }])
  })

  it('reads an attribute written alone as on, and leaves the earlier writing to legacyMentions', () => {
    expect(layoutMentions('## Un\n\n:layout{name="media-right" src="/a.png" previewWidth="1600" lightbox}\n')).toEqual([])
  })
})

describe('layoutAnnotationChange', () => {
  const changed = (raw: string, source: string) => {
    const change = layoutAnnotationChange(raw, layoutAnnotations(raw)[0]!, source)
    return raw.slice(0, change.from) + change.insert + raw.slice(change.to)
  }

  it('writes the source in place of the annotation', () => {
    expect(changed('## A\n\n:layout{name="full"}\nTexte\n', ':layout{media="left"}')).toBe('## A\n\n:layout{media="left"}\nTexte\n')
  })

  it('removes an annotation alone on its line with its line, and the blank line after it', () => {
    expect(changed('## A\n\n:layout{name="full"}\nTexte\n', '')).toBe('## A\n\nTexte\n')
    expect(changed('## A\n\n:layout{name="full"}\n\nTexte\n', '')).toBe('## A\n\nTexte\n')
  })

  it('removes an annotation written beside text and keeps the text', () => {
    expect(changed('## A\n\nTexte :layout{name="full"}\n', '')).toBe('## A\n\nTexte \n')
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
